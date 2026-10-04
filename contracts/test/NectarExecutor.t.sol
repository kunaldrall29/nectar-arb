// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NectarBase} from "./Base.t.sol";
import {MakerVault} from "../src/MakerVault.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {MiniMorpho} from "../src/lending/MiniMorpho.sol";
import {MarketParams} from "../src/lending/IMiniMorpho.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {TestToken} from "../src/mocks/TestToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Collateral token whose transfer hook tries to re-enter the executor with a second job.
contract ReentrantToken is ERC20 {
    address public target;
    bytes public payload;

    constructor() ERC20("Evil Stock", "EVIL") {}

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (target != address(0) && to == target) {
            address t = target;
            target = address(0);
            (bool ok, bytes memory ret) = t.call(payload);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}

contract NectarExecutorTest is NectarBase {
    event LiquidationSettled(
        bytes32 indexed jobId,
        bytes32 indexed quoteId,
        bytes32 indexed marketKey,
        address borrower,
        address maker,
        address keeper,
        uint256 debtRepaid,
        uint256 collateralDelivered,
        uint256 cashOut,
        uint256 keeperFee,
        uint256 protocolFee,
        uint256 surplus,
        uint256 writeoff,
        uint32 policyVersion
    );

    // T05 + T24: the PRD Section 9 numerical fixture settles exactly
    function test_T05_T24_HappyPathNumericalFixture() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        _setPrice(230); // 100 tTSLA * 230 * 0.5 = 11,500 < 12,000 debt => liquidatable

        NectarExecutor.Job memory job = _job(id);
        (NectarExecutor.Refusal code, uint256 expRepay, uint256 expSurplus) = executor.previewJob(job, keeper);
        assertEq(uint8(code), uint8(NectarExecutor.Refusal.OK));
        assertEq(expRepay, 10_000 * USDC);
        assertEq(expSurplus, 70 * USDC);

        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        vm.expectEmit(true, true, true, true, address(executor));
        emit LiquidationSettled(
            executor.jobIdOf(job),
            id,
            marketKey,
            borrower,
            maker,
            keeper,
            10_000 * USDC,
            50 * SHARE,
            10_140 * USDC,
            50 * USDC,
            20 * USDC,
            70 * USDC,
            0,
            1
        );
        vm.prank(keeper);
        NectarExecutor.Receipt memory r = executor.executeJob(job);

        // allocation sums to cashOut exactly
        assertEq(r.debtRepaid + r.keeperFee + r.protocolFee + r.surplus, r.cashOut);
        assertEq(r.cashOut, 10_140 * USDC);
        // balances
        assertEq(tsla.balanceOf(makerInventory), 50 * SHARE);
        assertEq(usdc.balanceOf(keeper), 50 * USDC);
        assertEq(usdc.balanceOf(treasury), 20 * USDC);
        assertEq(usdc.balanceOf(maker), makerUsdcBefore + 70 * USDC);
        // maker ledger: 20,000 - 10,140
        assertEq(vault.cashOf(maker, address(usdc)), 9_860 * USDC);
        assertEq(vault.reservedOf(maker, address(usdc)), 0);
        assertEq(usdc.balanceOf(address(vault)), vault.totalLiabilities(address(usdc)));
        // borrower position
        (, uint256 debt, uint256 coll) = morpho.position(morpho.idOf(params), borrower);
        assertEq(debt, 2_000 * USDC);
        assertEq(coll, 50 * SHARE);
        // nothing stranded in executor
        assertEq(usdc.balanceOf(address(executor)), 0);
        assertEq(tsla.balanceOf(address(executor)), 0);
        assertEq(uint8(vault.statusOf(id)), uint8(MakerVault.Status.Filled));
        assertEq(executor.jobsSettled(), 1);
        assertEq(uint8(executor.stage()), 0);
    }

    // T06
    function test_T06_ConsumedQuoteCannotBeReused() public {
        _deposit(30_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        _setPrice(200);
        vm.prank(keeper);
        executor.executeJob(_job(id));
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.QUOTE_NOT_FUNDED));
        executor.executeJob(_job(id));
    }

    // T07: expired quote
    function test_T07_ExpiredQuoteRevertsAndCanBeReleased() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        _setPrice(230);
        vm.warp(block.timestamp + 60); // exactly at validUntil
        vm.prank(gov);
        oracle.poke();
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.QUOTE_EXPIRED));
        executor.executeJob(_job(id));
        assertTrue(vault.releaseExpired(id));
        assertEq(vault.available(maker, address(usdc)), 20_000 * USDC);
    }

    function test_RevertWhen_JobDeadlinePassed() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        _setPrice(230);
        NectarExecutor.Job memory job = _job(id);
        job.deadline = block.timestamp - 1;
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.JOB_EXPIRED));
        executor.executeJob(job);
    }

    // healthy position refusal
    function test_RevertWhen_PositionHealthy() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.POSITION_HEALTHY));
        executor.executeJob(_job(id));
        assertEq(vault.reservedOf(maker, address(usdc)), 10_140 * USDC);
        assertEq(usdc.balanceOf(address(vault)), 20_000 * USDC);
    }

    function test_RevertWhen_WrongPosition() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        _setPrice(230);
        NectarExecutor.Job memory job = _job(id);
        job.borrower = makeAddr("someoneElse");
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.WRONG_POSITION));
        executor.executeJob(job);
    }

    // insufficient reserve: quote never registered => not funded
    function test_RevertWhen_QuoteNotFunded() public {
        _setPrice(230);
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.QUOTE_NOT_FUNDED));
        executor.executeJob(_job(keccak256("unregistered")));
    }

    // T11: price validity
    function _fixtureQuoteNonce(uint256 n) internal view returns (MakerVault.Quote memory q) {
        q = _fixtureQuote();
        q.nonce = n;
    }

    function test_T11_StalePausedZeroFuturePriceRefused() public {
        _deposit(30_000 * USDC);
        bytes32 id;
        uint256 p = 230 * DOLLAR_PRICE;
        vm.warp(block.timestamp + 1 days);
        id = _register(_fixtureQuoteNonce(10));

        vm.startPrank(gov);
        oracle.setObservation(p, block.timestamp - 1 hours - 1);
        vm.stopPrank();
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.PRICE_UNAVAILABLE));
        executor.executeJob(_job(id));

        vm.prank(gov);
        oracle.setObservation(p, block.timestamp + 10);
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.PRICE_UNAVAILABLE));
        executor.executeJob(_job(id));

        vm.prank(gov);
        oracle.setObservation(0, block.timestamp);
        (NectarExecutor.Refusal code,,) = executor.previewJob(_job(id), keeper);
        assertEq(uint8(code), uint8(NectarExecutor.Refusal.PRICE_UNAVAILABLE));

        vm.startPrank(gov);
        oracle.setObservation(p, block.timestamp);
        oracle.setPaused(true);
        vm.stopPrank();
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.PRICE_UNAVAILABLE));
        executor.executeJob(_job(id));

        vm.prank(gov);
        oracle.setPaused(false);
        vm.prank(keeper);
        executor.executeJob(_job(id));
    }

    // T14: debt repayment beyond the signed bound reverts in the callback
    function test_T14_DebtBeyondBoundReverts() public {
        _deposit(20_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.maxDebtRepay = 9_000 * USDC;
        bytes32 id = _register(q);
        _setPrice(230);
        (NectarExecutor.Refusal code, uint256 repay,) = executor.previewJob(_job(id), keeper);
        assertEq(uint8(code), uint8(NectarExecutor.Refusal.DEBT_EXCEEDS_BOUND));
        assertEq(repay, 10_000 * USDC);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(NectarExecutor.DebtExceedsBound.selector, 10_000 * USDC, 9_000 * USDC));
        executor.executeJob(_job(id));
        assertEq(vault.reservedOf(maker, address(usdc)), 10_140 * USDC);
        assertEq(tsla.balanceOf(makerInventory), 0);
    }

    // T15: another liquidator wins first
    function test_T15_OtherLiquidatorWinsFirst() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        _setPrice(230);
        address rival = makeAddr("rival");
        vm.prank(gov);
        usdc.mint(rival, 100_000 * USDC);
        vm.startPrank(rival);
        usdc.approve(address(morpho), type(uint256).max);
        morpho.liquidate(params, borrower, 60 * SHARE, "");
        vm.stopPrank();
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.POSITION_HEALTHY));
        executor.executeJob(_job(id));
    }

    function test_T15_PositionChangedWhenCollateralShrunk() public {
        _deposit(20_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.collateralAmount = 100 * SHARE;
        q.cashOut = 30_000 * USDC;
        q.maxDebtRepay = 12_000 * USDC;
        q.protocolFee = 30 * USDC;
        vm.prank(gov);
        usdc.mint(maker, 20_000 * USDC);
        _deposit(20_000 * USDC);
        bytes32 id = _register(q);
        _setPrice(130); // deep underwater
        address rival = makeAddr("rival");
        vm.prank(gov);
        usdc.mint(rival, 100_000 * USDC);
        vm.startPrank(rival);
        usdc.approve(address(morpho), type(uint256).max);
        morpho.liquidate(params, borrower, 10 * SHARE, "");
        vm.stopPrank();
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.POSITION_CHANGED));
        executor.executeJob(_job(id));
    }

    // T17: spoofed callback
    function test_T17_SpoofedCallbackReverts() public {
        vm.expectRevert(NectarExecutor.UnexpectedCallback.selector);
        executor.onMorphoLiquidate(1, abi.encode(bytes32(0)));
        vm.prank(address(morpho));
        vm.expectRevert(NectarExecutor.UnexpectedCallback.selector);
        executor.onMorphoLiquidate(1, abi.encode(bytes32(0)));
    }

    // Reentrancy guard: a malicious collateral token tries to start a nested job during settlement
    function test_ReentrancyNestedJobReverts() public {
        ReentrantToken evil = new ReentrantToken();
        MockOracle o = new MockOracle("EVIL/tUSDC", 100 * DOLLAR_PRICE, false, gov);
        MarketParams memory p2 = MarketParams(address(usdc), address(evil), address(o), 0.5e18);
        morpho.createMarket(p2);
        bytes32 adapterId = executor.ADAPTER_ID();
        vm.prank(gov);
        bytes32 k2 = registry.admitMarket(address(morpho), p2, adapterId, "EVIL/tUSDC", _policy());
        address victim = makeAddr("victim");
        evil.mint(victim, 100 * SHARE);
        vm.startPrank(lender);
        usdc.approve(address(morpho), type(uint256).max);
        vm.stopPrank();
        vm.prank(gov);
        usdc.mint(lender, 100_000 * USDC);
        vm.prank(lender);
        morpho.supply(p2, 100_000 * USDC, lender);
        vm.startPrank(victim);
        evil.approve(address(morpho), type(uint256).max);
        morpho.supplyCollateral(p2, 100 * SHARE, victim);
        morpho.borrow(p2, 4_900 * USDC, victim, victim);
        vm.stopPrank();

        _deposit(40_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.marketKey = k2;
        q.borrower = victim;
        q.collateralToken = address(evil);
        q.collateralAmount = 40 * SHARE;
        q.cashOut = 4_000 * USDC;
        q.maxDebtRepay = 3_900 * USDC;
        q.protocolFee = 5 * USDC;
        q.minNetSurplus = 0;
        bytes32 id = _register(q);
        MakerVault.Quote memory q2 = _fixtureQuoteNonce(2);
        bytes32 id2 = _register(q2);

        vm.prank(gov);
        o.setPrice(80 * DOLLAR_PRICE);
        _setPrice(200);

        NectarExecutor.Job memory nested = _job(id2);
        evil.arm(address(executor), abi.encodeCall(NectarExecutor.executeJob, (nested)));
        NectarExecutor.Job memory job = NectarExecutor.Job({quoteId: id, borrower: victim, deadline: block.timestamp});
        vm.prank(keeper);
        vm.expectRevert(NectarExecutor.Reentrancy.selector);
        executor.executeJob(job);
        // nothing moved
        assertEq(uint8(vault.statusOf(id)), uint8(MakerVault.Status.Active));
        assertEq(uint8(vault.statusOf(id2)), uint8(MakerVault.Status.Active));
        assertEq(vault.cashOf(maker, address(usdc)), 40_000 * USDC);
    }

    // T22: scoped pause
    function test_T22_GuardianPauseIsScoped() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        _setPrice(230);

        vm.prank(guardian);
        registry.pauseScope(marketKey, false, true);
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.SCOPE_PAUSED));
        executor.executeJob(_job(id));

        // other scope unaffected
        assertFalse(registry.isExecutionPaused(keccak256("otherMarket")));
        // unreserved withdrawal still works during pause
        vm.prank(maker);
        vault.withdraw(address(usdc), 9_860 * USDC, maker);

        // guardian cannot unpause
        vm.prank(guardian);
        vm.expectRevert(MarketRegistry.UnpauseRequiresGovernance.selector);
        registry.pauseScope(marketKey, false, false);
        vm.prank(makeAddr("rando"));
        vm.expectRevert(MarketRegistry.NotGuardian.selector);
        registry.pauseScope(marketKey, true, true);

        vm.prank(gov);
        registry.pauseScope(marketKey, false, false);
        vm.prank(keeper);
        executor.executeJob(_job(id));
    }

    function test_GlobalPauseBlocksAllMarkets() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        _setPrice(230);
        vm.startPrank(guardian);
        registry.pauseScope(registry.GLOBAL_SCOPE(), true, true);
        vm.stopPrank();
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.SCOPE_PAUSED));
        executor.executeJob(_job(id));
    }

    // T23: timelocked policy activation, outstanding quotes keep their version
    function test_T23_TimelockedPolicy() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        MarketRegistry.Policy memory p = _policy();
        p.minProtocolFeeBps = 50;
        vm.startPrank(gov);
        uint256 sid = registry.schedulePolicy(marketKey, p);
        vm.expectRevert(abi.encodeWithSelector(MarketRegistry.TooEarly.selector, uint64(block.timestamp + POLICY_DELAY)));
        registry.activatePolicy(sid);
        vm.stopPrank();

        vm.warp(block.timestamp + POLICY_DELAY);
        vm.startPrank(gov);
        registry.activatePolicy(sid);
        oracle.setPrice(230 * DOLLAR_PRICE);
        vm.expectRevert(MarketRegistry.AlreadyExecuted.selector);
        registry.activatePolicy(sid);
        vm.stopPrank();
        assertEq(registry.getPolicy(marketKey).version, 2);
        assertEq(registry.getPolicy(marketKey).minProtocolFeeBps, 50);

        // the v1 quote has expired anyway; a fresh v1-signed quote is refused at registration
        MakerVault.Quote memory q = _fixtureQuote();
        q.nonce = 2;
        vm.prank(maker);
        vm.expectRevert(MakerVault.PolicyVersionMismatch.selector);
        vault.registerQuote(q, "");
        vault.releaseExpired(id);
    }

    function test_PolicyChangeInvalidatesOutstandingQuoteExecution() public {
        vm.prank(gov);
        registry.setPolicyDelay(0);
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        vm.startPrank(gov);
        uint256 sid = registry.schedulePolicy(marketKey, _policy());
        registry.activatePolicy(sid);
        vm.stopPrank();
        _setPrice(230);
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.POLICY_VERSION_MISMATCH));
        executor.executeJob(_job(id));
    }

    // keeper allowlist toggle
    function test_KeeperAllowlistToggle() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        _setPrice(230);
        vm.prank(gov);
        registry.setKeeperAllowlistEnabled(true);
        vm.prank(keeper);
        vm.expectRevert(_refusal(NectarExecutor.Refusal.KEEPER_NOT_ALLOWED));
        executor.executeJob(_job(id));
        vm.prank(gov);
        registry.setKeeper(keeper, true);
        vm.prank(keeper);
        executor.executeJob(_job(id));
    }

    function test_OnlyGovernanceAdministers() public {
        address rando = makeAddr("rando");
        vm.startPrank(rando);
        vm.expectRevert();
        registry.setKeeperAllowlistEnabled(true);
        vm.expectRevert();
        registry.schedulePolicy(marketKey, _policy());
        vm.expectRevert();
        registry.setTreasury(rando);
        vm.expectRevert();
        vault.setCashToken(address(tsla), true);
        vm.stopPrank();
    }

    // EX09 / AC03: protocol writeoff is reported separately from cash repaid
    function test_BadDebtWriteoffReportedSeparately() public {
        _deposit(20_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.collateralAmount = 100 * SHARE;
        q.cashOut = 10_000 * USDC;
        q.maxDebtRepay = 9_900 * USDC;
        q.keeperFee = 50 * USDC;
        q.protocolFee = 20 * USDC;
        q.minNetSurplus = 0;
        bytes32 id = _register(q);
        _setPrice(100); // 100 tTSLA * $100 = $10,000 vs $12,000 debt
        vm.prank(keeper);
        NectarExecutor.Receipt memory r = executor.executeJob(_job(id));
        // repaid = 10,000 / 1.15 = 8,695.652174 (rounded up)
        assertEq(r.debtRepaid, 8_695_652_174);
        assertEq(r.writeoff, 12_000 * USDC - r.debtRepaid);
        assertEq(r.debtRepaid + r.keeperFee + r.protocolFee + r.surplus, r.cashOut);
        (, uint128 totalBorrow,, uint128 badDebt,) = morpho.market(morpho.idOf(params));
        assertEq(totalBorrow, 0);
        assertEq(badDebt, r.writeoff);
    }

    function testFuzz_SettlementAllocationConserves(uint16 priceDollars, uint8 seizePct) public {
        uint256 px = bound(uint256(priceDollars), 130, 239);
        uint256 seize = bound(uint256(seizePct), 1, 40) * SHARE;
        _deposit(50_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.collateralAmount = seize;
        q.cashOut = 20_000 * USDC;
        q.maxDebtRepay = 12_000 * USDC;
        q.minNetSurplus = 0;
        bytes32 id = _register(q);
        _setPrice(px);
        vm.prank(keeper);
        NectarExecutor.Receipt memory r = executor.executeJob(_job(id));
        assertEq(r.debtRepaid + r.keeperFee + r.protocolFee + r.surplus, r.cashOut);
        assertEq(usdc.balanceOf(address(executor)), 0);
        assertEq(tsla.balanceOf(makerInventory), seize);
        assertEq(usdc.balanceOf(address(vault)), vault.totalLiabilities(address(usdc)));
    }
}
