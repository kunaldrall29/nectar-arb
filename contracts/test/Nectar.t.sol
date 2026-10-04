// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {NectarBase} from "./Base.t.sol";
import {Quote, QuoteStatus, Scopes} from "../src/NectarTypes.sol";
import {MakerEscrow} from "../src/MakerEscrow.sol";
import {QuoteRegistry} from "../src/QuoteRegistry.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {MockFeeOnTransferERC20, MockERC20} from "../src/mocks/MockERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract SmartWalletMaker is IERC1271 {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes memory sig) external view returns (bytes4) {
        (address rec, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, sig);
        return err == ECDSA.RecoverError.NoError && rec == owner ? IERC1271.isValidSignature.selector : bytes4(0);
    }

    function call(address target, bytes calldata data) external {
        require(msg.sender == owner, "owner");
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}

contract NectarTest is NectarBase {
    // ---------------------------------------------------------------- cash accounts

    function test_T01_depositAndWithdrawUnreserved() public {
        assertEq(escrow.cash(maker, address(usdg)), 20_000 * USD);
        vm.prank(maker);
        escrow.withdraw(address(usdg), 5_000 * USD, maker);
        assertEq(escrow.cash(maker, address(usdg)), 15_000 * USD);
        assertEq(usdg.balanceOf(maker), 5_000 * USD);
        assertEq(usdg.balanceOf(address(escrow)), 15_000 * USD);
    }

    function test_UX02_deposit1000_reserve600_withdrawMax400() public {
        _deposit(maker2, 1_000 * USD);
        Quote memory q = _fixtureQuote(maker2);
        q.cashOut = 600 * USD;
        q.keeperCompensation = 0;
        q.protocolFee = 0;
        q.minNetSurplus = 0;
        quotes.registerQuote(q, _sign(q, maker2Pk));

        assertEq(escrow.available(maker2, address(usdg)), 400 * USD);
        vm.prank(maker2);
        vm.expectRevert(abi.encodeWithSelector(MakerEscrow.ReservedFunds.selector, 400 * USD, 401 * USD));
        escrow.withdraw(address(usdg), 401 * USD, maker2);

        vm.prank(maker2);
        escrow.withdraw(address(usdg), 400 * USD, maker2);
        assertEq(escrow.cash(maker2, address(usdg)), 600 * USD);
        assertEq(escrow.reserved(maker2, address(usdg)), 600 * USD);
    }

    function test_T03_earlyWithdrawOfCommittedCashReverts() public {
        _register(_fixtureQuote(maker));
        uint256 avail = 20_000 * USD - 10_140 * USD;
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(MakerEscrow.ReservedFunds.selector, avail, 20_000 * USD));
        escrow.withdraw(address(usdg), 20_000 * USD, maker);
        assertEq(escrow.cash(maker, address(usdg)), 20_000 * USD);
    }

    function test_LQ01_cannotWithdrawAnotherMakersCash() public {
        vm.prank(maker2);
        vm.expectRevert(abi.encodeWithSelector(MakerEscrow.ReservedFunds.selector, 0, 1));
        escrow.withdraw(address(usdg), 1, maker2);
    }

    function test_LQ07_feeOnTransferDepositReverts() public {
        MockFeeOnTransferERC20 fee = new MockFeeOnTransferERC20();
        fee.mint(maker, 1000);
        vm.startPrank(maker);
        fee.approve(address(escrow), 1000);
        vm.expectRevert(abi.encodeWithSelector(MakerEscrow.UnexpectedReceivedAmount.selector, 1000, 990));
        escrow.deposit(address(fee), 1000, maker);
        vm.stopPrank();
    }

    function test_onlyRegistryCanReserveOrConsume() public {
        vm.expectRevert(MakerEscrow.NotQuoteRegistry.selector);
        escrow.reserve(maker, address(usdg), 1, bytes32(0));
        vm.expectRevert(MakerEscrow.NotQuoteRegistry.selector);
        escrow.consume(maker, address(usdg), 1, bytes32(0), address(this));
    }

    function testFuzz_withdrawNeverExceedsAvailable(uint96 dep, uint96 res, uint96 req) public {
        uint256 d = bound(dep, 1, 1e15);
        uint256 r = bound(res, 0, d);
        _deposit(maker2, d);
        if (r > 0) {
            Quote memory q = _fixtureQuote(maker2);
            q.cashOut = r;
            q.keeperCompensation = 0;
            q.protocolFee = 0;
            q.minNetSurplus = 0;
            quotes.registerQuote(q, _sign(q, maker2Pk));
        }
        uint256 amount = bound(req, 1, 2e15);
        vm.prank(maker2);
        if (amount > d - r) {
            vm.expectRevert(abi.encodeWithSelector(MakerEscrow.ReservedFunds.selector, d - r, amount));
            escrow.withdraw(address(usdg), amount, maker2);
        } else {
            escrow.withdraw(address(usdg), amount, maker2);
            assertEq(escrow.cash(maker2, address(usdg)), d - amount);
        }
        assertGe(escrow.cash(maker2, address(usdg)), escrow.reserved(maker2, address(usdg)));
    }

    // ---------------------------------------------------------------- quote registration

    function test_T02_registerReservesFullObligation() public {
        bytes32 id = _register(_fixtureQuote(maker));
        assertEq(escrow.reserved(maker, address(usdg)), 10_140 * USD);
        assertEq(escrow.available(maker, address(usdg)), 9_860 * USD);
        (, QuoteStatus st) = quotes.getQuote(id);
        assertEq(uint8(st), uint8(QuoteStatus.Active));
    }

    function test_T04_registerMoreThanAvailableReverts() public {
        Quote memory q = _fixtureQuote(maker);
        q.cashOut = 20_001 * USD;
        bytes memory sig = _sign(q, makerPk);
        vm.expectRevert(abi.encodeWithSelector(MakerEscrow.InsufficientAvailableCash.selector, 20_000 * USD, 20_001 * USD));
        quotes.registerQuote(q, sig);
        assertEq(escrow.reserved(maker, address(usdg)), 0);
    }

    function test_LQ02_allowanceWithoutDepositGivesNoCapacity() public {
        usdg.mint(maker2, 50_000 * USD);
        vm.prank(maker2);
        usdg.approve(address(escrow), type(uint256).max);
        Quote memory q = _fixtureQuote(maker2);
        bytes memory sig = _sign(q, maker2Pk);
        vm.expectRevert(abi.encodeWithSelector(MakerEscrow.InsufficientAvailableCash.selector, 0, 10_140 * USD));
        quotes.registerQuote(q, sig);
    }

    function test_LQ03_lifetimeAbove120Reverts() public {
        Quote memory q = _fixtureQuote(maker);
        q.validUntil = uint64(block.timestamp + 121);
        bytes memory sig = _sign(q, makerPk);
        vm.expectRevert(QuoteRegistry.LifetimeTooLong.selector);
        quotes.registerQuote(q, sig);
    }

    function test_registerAlreadyExpiredReverts() public {
        Quote memory q = _fixtureQuote(maker);
        q.validUntil = uint64(block.timestamp);
        bytes memory sig = _sign(q, makerPk);
        vm.expectRevert(QuoteRegistry.QuoteExpired.selector);
        quotes.registerQuote(q, sig);
    }

    function test_duplicateRegistrationReverts() public {
        Quote memory q = _fixtureQuote(maker);
        bytes memory sig = _sign(q, makerPk);
        quotes.registerQuote(q, sig);
        vm.expectRevert(QuoteRegistry.DuplicateQuote.selector);
        quotes.registerQuote(q, sig);
    }

    function test_T09_alteredFieldsInvalidateSignature() public {
        Quote memory q = _fixtureQuote(maker);
        bytes memory sig = _sign(q, makerPk);

        Quote memory a = _copy(q);
        a.collateralRecipient = address(0xBAD);
        vm.expectRevert(QuoteRegistry.InvalidSignature.selector);
        quotes.registerQuote(a, sig);

        a = _copy(q);
        a.cashOut = q.cashOut - 1;
        vm.expectRevert(QuoteRegistry.InvalidSignature.selector);
        quotes.registerQuote(a, sig);

        a = _copy(q);
        a.validUntil = q.validUntil + 1;
        vm.expectRevert(QuoteRegistry.InvalidSignature.selector);
        quotes.registerQuote(a, sig);

        a = _copy(q);
        a.protocolFee = 0;
        vm.expectRevert(QuoteRegistry.InvalidSignature.selector);
        quotes.registerQuote(a, sig);

        a = _copy(q);
        a.surplusRecipient = address(0xBAD);
        vm.expectRevert(QuoteRegistry.InvalidSignature.selector);
        quotes.registerQuote(a, sig);
    }

    function test_T10_crossChainAndCrossContractReplayFails() public {
        Quote memory q = _fixtureQuote(maker);
        bytes memory sig = _sign(q, makerPk);

        QuoteRegistry other = new QuoteRegistry(escrow, registry, guard);
        vm.expectRevert(QuoteRegistry.InvalidSignature.selector);
        other.registerQuote(q, sig);

        vm.chainId(46630);
        vm.expectRevert(QuoteRegistry.InvalidSignature.selector);
        quotes.registerQuote(q, sig);
        vm.chainId(31337);
        quotes.registerQuote(q, sig);
    }

    function test_T10_signatureFromOtherChainDomainFails() public {
        Quote memory q = _fixtureQuote(maker);
        vm.chainId(421614);
        bytes memory sigOtherChain = _sign(q, makerPk);
        vm.chainId(31337);
        vm.expectRevert(QuoteRegistry.InvalidSignature.selector);
        quotes.registerQuote(q, sigOtherChain);
    }

    function test_makerNonceCancelsUnregisteredQuote() public {
        Quote memory q = _fixtureQuote(maker);
        bytes memory sig = _sign(q, makerPk);
        vm.prank(maker);
        quotes.incrementMakerNonce();
        vm.expectRevert(QuoteRegistry.BadMakerNonce.selector);
        quotes.registerQuote(q, sig);
    }

    function test_T27_eip1271MakerWallet() public {
        SmartWalletMaker wallet = new SmartWalletMaker(vm.addr(maker2Pk));
        usdg.mint(address(wallet), 15_000 * USD);
        vm.startPrank(vm.addr(maker2Pk));
        wallet.call(address(usdg), abi.encodeCall(usdg.approve, (address(escrow), 15_000 * USD)));
        wallet.call(address(escrow), abi.encodeCall(escrow.deposit, (address(usdg), 15_000 * USD, address(wallet))));
        vm.stopPrank();

        Quote memory q = _fixtureQuote(address(wallet));
        bytes memory wrongSig = _sign(q, makerPk);
        vm.expectRevert(QuoteRegistry.InvalidSignature.selector);
        quotes.registerQuote(q, wrongSig);

        bytes32 id = quotes.registerQuote(q, _sign(q, maker2Pk));
        assertEq(escrow.reserved(address(wallet), address(usdg)), 10_140 * USD);

        _makeUnhealthy();
        vm.prank(keeper);
        executor.executeJob(id, uint64(block.timestamp + 10));
        assertEq(tsla.balanceOf(makerInventory), 50 * SHARE);
    }

    // ---------------------------------------------------------------- execution

    function test_T05_T24_numericalFixtureSettlesExactly() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();

        NectarExecutor.Preview memory p = executor.previewJob(id, uint64(block.timestamp + 10), keeper);
        assertEq(uint8(p.reason), uint8(NectarExecutor.Refusal.NONE));
        assertEq(p.repaidAssets, 10_000 * USD);
        assertEq(p.surplus, 70 * USD);

        uint256 lmBefore = usdg.balanceOf(address(lm));
        vm.prank(keeper);
        bytes32 jobId = executor.executeJob(id, uint64(block.timestamp + 10));
        assertEq(jobId, executor.jobIdFor(id));

        uint256 repaid = usdg.balanceOf(address(lm)) - lmBefore;
        uint256 k = usdg.balanceOf(keeper);
        uint256 f = usdg.balanceOf(treasury);
        uint256 s = usdg.balanceOf(operator);
        assertEq(repaid, 10_000 * USD);
        assertEq(k, 50 * USD);
        assertEq(f, 20 * USD);
        assertEq(s, 70 * USD);
        assertEq(repaid + k + f + s, 10_140 * USD);

        assertEq(tsla.balanceOf(makerInventory), 50 * SHARE);
        (uint256 coll, uint256 debt) = lm.position(morphoId, borrower);
        assertEq(coll, 10 * SHARE);
        assertEq(debt, 0);

        assertEq(escrow.cash(maker, address(usdg)), 20_000 * USD - 10_140 * USD);
        assertEq(escrow.reserved(maker, address(usdg)), 0);
        assertEq(usdg.balanceOf(address(executor)), 0);
        assertEq(tsla.balanceOf(address(executor)), 0);
        (, QuoteStatus st) = quotes.getQuote(id);
        assertEq(uint8(st), uint8(QuoteStatus.Consumed));
    }

    function test_T24_cashOut10040FailsUnderSameMinimums() public {
        Quote memory q = _fixtureQuote(maker);
        q.cashOut = 10_040 * USD;
        bytes32 id = _register(q);
        _makeUnhealthy();
        NectarExecutor.Preview memory p = executor.previewJob(id, uint64(block.timestamp + 10), keeper);
        assertEq(uint8(p.reason), uint8(NectarExecutor.Refusal.INSUFFICIENT_PROCEEDS));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(NectarExecutor.Refused.selector, NectarExecutor.Refusal.INSUFFICIENT_PROCEEDS));
        executor.executeJob(id, uint64(block.timestamp + 10));
        assertEq(escrow.reserved(maker, address(usdg)), 10_040 * USD);
    }

    function test_T06_replayConsumedQuoteReverts() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        vm.prank(keeper);
        executor.executeJob(id, uint64(block.timestamp + 10));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(NectarExecutor.Refused.selector, NectarExecutor.Refusal.QUOTE_NOT_FUNDED));
        executor.executeJob(id, uint64(block.timestamp + 10));
    }

    function test_T07_executeAtExpiryReverts_releaseWorks() public {
        Quote memory q = _fixtureQuote(maker);
        bytes32 id = _register(q);
        _makeUnhealthy();
        vm.warp(q.validUntil);
        oracle.setPrice(px(230));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(NectarExecutor.Refused.selector, NectarExecutor.Refusal.QUOTE_EXPIRED));
        executor.executeJob(id, uint64(block.timestamp + 10));

        assertTrue(quotes.releaseExpired(id));
        assertEq(escrow.reserved(maker, address(usdg)), 0);
        assertEq(escrow.available(maker, address(usdg)), 20_000 * USD);
    }

    function test_T07_releaseBeforeExpiryReverts() public {
        bytes32 id = _register(_fixtureQuote(maker));
        vm.expectRevert(QuoteRegistry.QuoteNotExpired.selector);
        quotes.releaseExpired(id);
    }

    function test_T08_doubleReleaseNoDuplicateCredit() public {
        Quote memory q = _fixtureQuote(maker);
        bytes32 id = _register(q);
        vm.warp(q.validUntil + 1);
        vm.prank(address(0xCAFE));
        assertTrue(quotes.releaseExpired(id));
        assertFalse(quotes.releaseExpired(id));
        assertEq(escrow.reserved(maker, address(usdg)), 0);
        assertEq(escrow.cash(maker, address(usdg)), 20_000 * USD);
        assertEq(usdg.balanceOf(address(0xCAFE)), 0);
    }

    function test_jobDeadlineEnforced() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(NectarExecutor.Refused.selector, NectarExecutor.Refusal.JOB_EXPIRED));
        executor.executeJob(id, uint64(block.timestamp - 1));
    }

    function test_T11_stalePriceRefused() public {
        bytes32 id = _register(_fixtureQuote(maker));
        oracle.setPriceWithTimestamp(px(230), block.timestamp - 3601);
        _expectRefusal(id, NectarExecutor.Refusal.PRICE_UNAVAILABLE);
    }

    function test_T11_futurePriceRefused() public {
        bytes32 id = _register(_fixtureQuote(maker));
        oracle.setPriceWithTimestamp(px(230), block.timestamp + 1);
        _expectRefusal(id, NectarExecutor.Refusal.PRICE_UNAVAILABLE);
    }

    function test_T11_zeroPriceRefused() public {
        bytes32 id = _register(_fixtureQuote(maker));
        oracle.setPrice(0);
        _expectRefusal(id, NectarExecutor.Refusal.PRICE_UNAVAILABLE);
    }

    function test_T11_pausedFeedRefused() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        oracle.setPaused(true);
        _expectRefusal(id, NectarExecutor.Refusal.PRICE_UNAVAILABLE);
    }

    function test_T12_sequencerDownAndGraceRefused() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        seqFeed.setStatus(true);
        _expectRefusal(id, NectarExecutor.Refusal.SEQUENCER_UNAVAILABLE);
        seqFeed.setStatus(false);
        _expectRefusal(id, NectarExecutor.Refusal.SEQUENCER_UNAVAILABLE);
    }

    function test_T14_debtAboveBoundReverts() public {
        Quote memory q = _fixtureQuote(maker);
        q.maxDebtRepay = 9_999 * USD;
        bytes32 id = _register(q);
        _makeUnhealthy();
        _expectRefusal(id, NectarExecutor.Refusal.DEBT_ABOVE_BOUND);
    }

    function test_T15_positionChangedRefused() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        usdg.mint(borrower, 10_000 * USD);
        vm.startPrank(borrower);
        usdg.approve(address(lm), type(uint256).max);
        lm.repay(params, 10_000 * USD, borrower);
        vm.stopPrank();
        _expectRefusal(id, NectarExecutor.Refusal.POSITION_CHANGED);
    }

    function test_PX04_healthyPositionCannotBeLiquidatedEvenWithWillingBuyer() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _expectRefusal(id, NectarExecutor.Refusal.POSITION_CHANGED);
    }

    function test_T17_spoofedCallbackReverts() public {
        vm.expectRevert(NectarExecutor.UnexpectedCallback.selector);
        executor.onMorphoLiquidate(1, abi.encode(bytes32(0)));
    }

    function test_T18_tokenFreezeRevertsAtomically() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        vm.prank(address(this));
        tsla.setFrozen(makerInventory, true);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MockERC20.Frozen.selector, makerInventory));
        executor.executeJob(id, uint64(block.timestamp + 10));
        assertEq(escrow.reserved(maker, address(usdg)), 10_140 * USD);
        assertEq(escrow.cash(maker, address(usdg)), 20_000 * USD);
        (, QuoteStatus st) = quotes.getQuote(id);
        assertEq(uint8(st), uint8(QuoteStatus.Active));
        (uint256 coll, uint256 debt) = lm.position(morphoId, borrower);
        assertEq(coll, 60 * SHARE);
        assertEq(debt, 10_000 * USD);
    }

    function test_AC03_writeoffReportedSeparately() public {
        Quote memory q = _fixtureQuote(maker);
        q.collateralAmount = 60 * SHARE;
        q.cashOut = 12_100 * USD;
        q.maxDebtRepay = 12_000 * USD;
        q.minNetSurplus = 0;
        bytes32 id = _register(q);
        oracle.setPrice(px(150));
        vm.recordLogs();
        vm.prank(keeper);
        executor.executeJob(id, uint64(block.timestamp + 10));
        (uint256 coll, uint256 debt) = lm.position(morphoId, borrower);
        assertEq(coll, 0);
        assertEq(debt, 0);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        NectarExecutor.Settlement memory s;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == NectarExecutor.LiquidationSettled.selector) {
                s = abi.decode(logs[i].data, (NectarExecutor.Settlement));
            }
        }
        // 60 shares * $150 / 1.15 LIF = 7,826.086957 repaid in cash; remaining 2,173.913043 is a protocol writeoff.
        assertEq(s.repaidAssets, 7_826_086_957);
        assertEq(s.writeoff, 10_000 * USD - 7_826_086_957);
        assertEq(s.repaidAssets + s.keeperCompensation + s.protocolFee + s.surplus, s.cashOut);
        assertEq(usdg.balanceOf(operator), s.surplus);
    }

    // ---------------------------------------------------------------- guardian / governance

    function test_T22_pauseExecutionScopeBlocksOnlyThatScope_withdrawalsContinue() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        vm.prank(guardian);
        guard.pauseScope(Scopes.marketExecution(marketKey));
        _expectRefusal(id, NectarExecutor.Refusal.SCOPE_PAUSED);

        vm.prank(maker);
        escrow.withdraw(address(usdg), 9_860 * USD, maker);

        Quote memory q2 = _fixtureQuote(maker2);
        _deposit(maker2, 11_000 * USD);
        quotes.registerQuote(q2, _sign(q2, maker2Pk));

        vm.prank(guardian);
        vm.expectRevert(PauseGuardLike.NotRecoveryAuthority.selector);
        guard.unpauseScope(Scopes.marketExecution(marketKey));

        vm.prank(governance);
        guard.unpauseScope(Scopes.marketExecution(marketKey));
        vm.prank(keeper);
        executor.executeJob(id, uint64(block.timestamp + 10));
    }

    function test_T22_pauseReservations() public {
        vm.prank(guardian);
        guard.pauseScope(Scopes.GLOBAL_RESERVATIONS);
        Quote memory q = _fixtureQuote(maker);
        bytes memory sig = _sign(q, makerPk);
        vm.expectRevert(QuoteRegistry.ScopePaused.selector);
        quotes.registerQuote(q, sig);
    }

    function test_pauseGlobalExecution() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        vm.prank(guardian);
        guard.pauseScope(Scopes.GLOBAL_EXECUTION);
        _expectRefusal(id, NectarExecutor.Refusal.SCOPE_PAUSED);
    }

    function test_nonGuardianCannotPause() public {
        vm.expectRevert(PauseGuardLike.NotGuardian.selector);
        guard.pauseScope(Scopes.GLOBAL_EXECUTION);
    }

    function test_T23_timelockedPolicyActivation() public {
        MarketRegistry slow = new MarketRegistry(governance, 48 hours);
        vm.startPrank(governance);
        bytes32 sid = slow.schedulePolicy(_policy());
        vm.expectRevert(abi.encodeWithSelector(MarketRegistry.TooEarly.selector, uint64(block.timestamp + 48 hours)));
        slow.activatePolicy(sid);
        vm.warp(block.timestamp + 48 hours);
        slow.activatePolicy(sid);
        vm.expectRevert(MarketRegistry.AlreadyActivated.selector);
        slow.activatePolicy(sid);
        vm.stopPrank();
    }

    function test_MK04_policyUpdateInvalidatesOutstandingQuoteExecution() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        MarketRegistry.Policy memory p = _policy();
        p.maxPriceAge = 600;
        vm.startPrank(governance);
        registry.activatePolicy(registry.schedulePolicy(p));
        vm.stopPrank();
        _expectRefusal(id, NectarExecutor.Refusal.POLICY_CHANGED);
    }

    function test_MK01_mismatchedFeedRejected() public {
        MarketRegistry.Policy memory p = _policy();
        p.priceSource = address(0x1234);
        vm.prank(governance);
        vm.expectRevert(abi.encodeWithSelector(MarketRegistry.InvalidPolicy.selector, "feed mismatch"));
        registry.schedulePolicy(p);
    }

    function test_keeperAllowlist() public {
        bytes32 id = _register(_fixtureQuote(maker));
        _makeUnhealthy();
        vm.prank(governance);
        executor.setKeeperAllowlist(true);
        _expectRefusal(id, NectarExecutor.Refusal.KEEPER_NOT_ALLOWED);
        vm.prank(governance);
        executor.setKeeper(keeper, true);
        vm.prank(keeper);
        executor.executeJob(id, uint64(block.timestamp + 10));
    }

    // ---------------------------------------------------------------- helpers

    function _expectRefusal(bytes32 id, NectarExecutor.Refusal r) internal {
        NectarExecutor.Preview memory p = executor.previewJob(id, uint64(block.timestamp + 10), keeper);
        assertEq(uint8(p.reason), uint8(r), "preview reason");
        uint256 cashBefore = escrow.cash(maker, address(usdg));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(NectarExecutor.Refused.selector, r));
        executor.executeJob(id, uint64(block.timestamp + 10));
        assertEq(escrow.cash(maker, address(usdg)), cashBefore);
    }

    function _copy(Quote memory q) internal pure returns (Quote memory c) {
        c = abi.decode(abi.encode(q), (Quote));
    }
}

interface PauseGuardLike {
    error NotGuardian();
    error NotRecoveryAuthority();
}
