// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Types} from "../src/Types.sol";
import {QuoteLib} from "../src/libraries/QuoteLib.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {MorphoBlueAdapter} from "../src/adapters/MorphoBlueAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {MockSequencer} from "../src/mocks/MockSequencer.sol";
import {MockMorpho} from "../src/mocks/MockMorpho.sol";
import {MockAMM} from "../src/mocks/MockAMM.sol";
import {
    RESERVED_FUNDS,
    QUOTE_NOT_FUNDED,
    QUOTE_EXPIRED,
    QuoteAlreadyUsed,
    InvalidSignature,
    WRONG_NETWORK,
    PRICE_UNAVAILABLE,
    SEQUENCER_UNAVAILABLE,
    INSUFFICIENT_PROCEEDS,
    UnexpectedCallback,
    NestedJob,
    SCOPE_PAUSED,
    PolicyNotReady,
    Unauthorized
} from "../src/Errors.sol";

contract MaliciousNestedAdapter {
    NectarExecutor public exec;
    Types.Job public job;
    Types.Quote public quote;
    Types.Route public route;

    function arm(address exec_, Types.Job memory job_, Types.Quote memory quote_, Types.Route memory route_) external {
        exec = NectarExecutor(exec_);
        job = job_;
        quote = quote_;
        route = route_;
    }

    function execute(Types.Job calldata, Types.Quote calldata, Types.Route calldata, bytes32) external {
        exec.executeJob(job, quote, route);
    }

    function onMorphoLiquidate(uint256, bytes calldata) external {}
}

contract NectarTest is Test {
    uint256 internal makerPk;
    address internal maker;
    address internal keeper;
    address internal borrower;
    address internal treasury;
    address internal guardian;
    address internal recovery;

    MockERC20 internal debt;
    MockERC20 internal collat;
    MockOracle internal oracle;
    MockSequencer internal sequencer;
    MockMorpho internal morpho;
    MockAMM internal amm;
    MarketRegistry internal registry;
    QuoteEscrow internal escrow;
    RiskGuard internal guard;
    NectarExecutor internal executor;
    MorphoBlueAdapter internal adapter;

    bytes32 internal marketKey;
    bytes32 internal morphoMarketId;
    bytes32 internal policyHash;
    uint256 internal adapterVersion = 1;

    uint256 internal constant COLLATERAL = 20_000;
    uint256 internal constant DEBT = 10_000;
    uint256 internal constant CASHOUT = 10_140;
    uint256 internal constant KEEPER_FEE = 50;
    uint256 internal constant PROTOCOL_FEE = 20;
    uint256 internal constant SURPLUS = 70;

    function setUp() public {
        makerPk = 0xA11CE;
        maker = vm.addr(makerPk);
        keeper = makeAddr("keeper");
        borrower = makeAddr("borrower");
        treasury = makeAddr("treasury");
        guardian = makeAddr("guardian");
        recovery = makeAddr("recovery");

        debt = new MockERC20("Mock USDC", "mUSDC", 6);
        collat = new MockERC20("Mock Stock", "mSTK", 18);
        oracle = new MockOracle(1e18, keccak256("mSTK/USD"));
        sequencer = new MockSequencer();
        morpho = new MockMorpho();
        amm = new MockAMM();

        registry = new MarketRegistry(address(this), guardian, recovery, 1 hours);
        escrow = new QuoteEscrow(address(this), address(registry));
        guard = new RiskGuard();
        executor = new NectarExecutor(address(this), address(registry), address(escrow), address(guard));
        adapter = new MorphoBlueAdapter(address(executor), address(morpho), treasury);
        escrow.setExecutor(address(executor));
        executor.setKeeperAllowlistEnabled(true);
        executor.setKeeper(keeper, true);

        morphoMarketId = morpho.createMarket(address(debt), address(collat), address(oracle), 0.8e18);
        marketKey = keccak256(abi.encode(block.chainid, address(morpho), morphoMarketId));

        Types.Market memory m = Types.Market({
            marketKey: marketKey,
            chainId: block.chainid,
            protocol: address(morpho),
            morphoMarketId: morphoMarketId,
            adapter: address(adapter),
            adapterVersion: adapterVersion,
            debtToken: address(debt),
            collateralToken: address(collat),
            oracle: address(oracle),
            sequencer: address(sequencer),
            lltv: 0.8e18,
            admitted: true,
            mockLabeled: true
        });
        Types.Policy memory p = Types.Policy({
            version: 1,
            hash: bytes32(0),
            maxQuoteLifetime: 120,
            minPriceFreshness: 3600,
            sequencerGrace: 0,
            protocolFeeRecipient: treasury,
            ammEnabled: true
        });
        p.hash = QuoteLib.policyHash(p);
        policyHash = p.hash;
        registry.admitMarket(m, p);

        collat.mint(address(this), COLLATERAL);
        collat.approve(address(morpho), COLLATERAL);
        morpho.seedPosition(morphoMarketId, borrower, COLLATERAL, DEBT);

        // Position is healthy at price 1e18: 20000 * 0.8 = 16000 >= 10000
        debt.mint(maker, 50_000);
        vm.prank(maker);
        debt.approve(address(escrow), type(uint256).max);

        amm.setQuote(address(collat), COLLATERAL, address(debt), 9_820);
        debt.mint(address(amm), 50_000);
    }

    function _dropPrice() internal {
        oracle.set(5e17, block.timestamp, false); // 0.5 → max borrow 8000 < 10000
    }

    function _quote(uint256 cashOut, uint256 validFor) internal view returns (Types.Quote memory q) {
        q.schemaVersion = 1;
        q.chainId = block.chainid;
        q.verifyingContract = address(escrow);
        q.maker = maker;
        q.makerNonce = escrow.makerNonces(maker);
        q.marketKey = marketKey;
        q.adapterVersion = adapterVersion;
        q.borrower = borrower;
        q.positionKey = QuoteLib.positionKey(marketKey, borrower);
        q.collateralToken = address(collat);
        q.collateralAmount = COLLATERAL;
        q.debtToken = address(debt);
        q.cashOut = cashOut;
        q.maxDebtRepay = DEBT;
        q.collateralRecipient = maker;
        q.keeperCompensation = KEEPER_FEE;
        q.protocolFee = PROTOCOL_FEE;
        q.minNetSurplus = SURPLUS;
        q.keeperRecipient = keeper;
        q.surplusRecipient = maker;
        q.validUntil = block.timestamp + validFor;
        q.reservationId = keccak256(abi.encode(maker, escrow.makerNonces(maker), cashOut, validFor, block.timestamp));
        q.policyHash = policyHash;
        q.quoteNonce = uint256(keccak256(abi.encode(q.reservationId, "qn")));
    }

    function _sign(Types.Quote memory q) internal view returns (bytes memory) {
        bytes32 digest = QuoteLib.digest(address(escrow), q);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _fundAndRegister(uint256 cashOut) internal returns (Types.Quote memory q) {
        q = _quote(cashOut, 60);
        vm.prank(maker);
        escrow.deposit(address(debt), cashOut, maker);
        escrow.registerQuote(q, _sign(q));
    }

    function _job(Types.Quote memory q) internal view returns (Types.Job memory job) {
        job = Types.Job({
            marketKey: marketKey,
            borrower: borrower,
            seizedCollateral: COLLATERAL,
            maxDebtRepay: DEBT,
            quoteId: QuoteLib.quoteId(q),
            deadline: q.validUntil,
            keeper: keeper
        });
    }

    function _makerRoute() internal view returns (Types.Route memory) {
        return Types.Route({kind: Types.ROUTE_MAKER, amm: address(amm), minOut: 0});
    }

    function _fill(Types.Quote memory q) internal {
        _dropPrice();
        vm.prank(keeper);
        executor.executeJob(_job(q), q, _makerRoute());
    }

    // --- T01 ---
    function test_T01_depositWithdrawUnreserved() public {
        vm.startPrank(maker);
        escrow.deposit(address(debt), 1_000, maker);
        assertEq(escrow.cashOf(maker, address(debt)), 1_000);
        assertEq(escrow.available(maker, address(debt)), 1_000);
        uint256 before = debt.balanceOf(maker);
        escrow.withdraw(address(debt), 400, maker);
        vm.stopPrank();
        assertEq(escrow.cashOf(maker, address(debt)), 600);
        assertEq(debt.balanceOf(maker), before + 400);
    }

    // --- T02 ---
    function test_T02_reserveValidQuote() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        assertEq(escrow.reservedOf(maker, address(debt)), CASHOUT);
        assertEq(escrow.available(maker, address(debt)), 0);
        QuoteEscrow.QuoteRecord memory rec = escrow.getQuote(QuoteLib.quoteId(q));
        assertTrue(rec.reserved);
    }

    // --- T03 ---
    function test_T03_withdrawCommittedReverts() public {
        _fundAndRegister(CASHOUT);
        vm.prank(maker);
        vm.expectRevert(RESERVED_FUNDS.selector);
        escrow.withdraw(address(debt), 1, maker);
        assertEq(escrow.cashOf(maker, address(debt)), CASHOUT);
        assertEq(escrow.reservedOf(maker, address(debt)), CASHOUT);
    }

    // --- T04 ---
    function test_T04_registerMoreThanAvailableReverts() public {
        vm.prank(maker);
        escrow.deposit(address(debt), 100, maker);
        Types.Quote memory q = _quote(CASHOUT, 60);
        vm.expectRevert(QUOTE_NOT_FUNDED.selector);
        escrow.registerQuote(q, _sign(q));
        assertEq(escrow.reservedOf(maker, address(debt)), 0);
    }

    // --- T05 + T24 ---
    function test_T05_T24_fillFixtureSumsTo10140() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        uint256 makerDebtBefore = debt.balanceOf(maker);
        _fill(q);

        assertEq(debt.balanceOf(address(morpho)), DEBT, "debt repaid");
        assertEq(debt.balanceOf(keeper), KEEPER_FEE);
        assertEq(debt.balanceOf(treasury), PROTOCOL_FEE);
        assertEq(debt.balanceOf(maker) - makerDebtBefore, SURPLUS);
        assertEq(collat.balanceOf(maker), COLLATERAL);
        assertEq(DEBT + KEEPER_FEE + PROTOCOL_FEE + SURPLUS, CASHOUT);
        assertEq(escrow.cashOf(maker, address(debt)), 0);
        assertEq(escrow.reservedOf(maker, address(debt)), 0);
        assertEq(debt.balanceOf(address(escrow)), 0);
        assertTrue(escrow.getQuote(QuoteLib.quoteId(q)).consumed);
    }

    function test_T24_cashOut10040Fails() public {
        Types.Quote memory q = _fundAndRegister(10_040);
        _dropPrice();
        Types.PreviewResult memory prev = executor.previewJob(_job(q), q, _makerRoute());
        assertFalse(prev.ok);
        vm.prank(keeper);
        vm.expectRevert(INSUFFICIENT_PROCEEDS.selector);
        executor.executeJob(_job(q), q, _makerRoute());
        assertEq(escrow.reservedOf(maker, address(debt)), 10_040);
        assertEq(collat.balanceOf(maker), 0);
    }

    // --- T06 ---
    function test_T06_reuseConsumedQuoteReverts() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        _fill(q);
        vm.prank(keeper);
        vm.expectRevert(QUOTE_NOT_FUNDED.selector);
        executor.executeJob(_job(q), q, _makerRoute());
    }

    // --- T07 ---
    function test_T07_executeAtExpiryRevertsReleasePossible() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        vm.warp(q.validUntil);
        _dropPrice();
        vm.prank(keeper);
        vm.expectRevert(QUOTE_EXPIRED.selector);
        executor.executeJob(_job(q), q, _makerRoute());
        escrow.releaseExpired(QuoteLib.quoteId(q));
        assertEq(escrow.available(maker, address(debt)), CASHOUT);
    }

    // --- T08 ---
    function test_T08_releaseExpiredTwiceNoDuplicateCredit() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        vm.warp(q.validUntil);
        bytes32 qid = QuoteLib.quoteId(q);
        escrow.releaseExpired(qid);
        uint256 avail = escrow.available(maker, address(debt));
        escrow.releaseExpired(qid);
        assertEq(escrow.available(maker, address(debt)), avail);
        assertEq(avail, CASHOUT);
    }

    // --- T09 ---
    function test_T09_alteredAmountInvalidatesSignature() public {
        vm.prank(maker);
        escrow.deposit(address(debt), CASHOUT, maker);
        Types.Quote memory q = _quote(CASHOUT, 60);
        bytes memory sig = _sign(q);
        q.cashOut = CASHOUT + 1;
        vm.expectRevert(InvalidSignature.selector);
        escrow.registerQuote(q, sig);
        q = _quote(CASHOUT, 60);
        sig = _sign(q);
        q.collateralRecipient = keeper;
        vm.expectRevert(InvalidSignature.selector);
        escrow.registerQuote(q, sig);
    }

    // --- T10 ---
    function test_T10_replayOtherEscrowFails() public {
        vm.prank(maker);
        escrow.deposit(address(debt), CASHOUT, maker);
        Types.Quote memory q = _quote(CASHOUT, 60);
        bytes memory sig = _sign(q);

        QuoteEscrow escrow2 = new QuoteEscrow(address(this), address(registry));
        vm.prank(maker);
        debt.approve(address(escrow2), type(uint256).max);
        vm.prank(maker);
        escrow2.deposit(address(debt), CASHOUT, maker);
        vm.expectRevert(WRONG_NETWORK.selector);
        escrow2.registerQuote(q, sig);
    }

    // --- T11 ---
    function test_T11_stalePausedInvalidPriceRefuse() public {
        vm.warp(10_000);
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        _dropPrice();

        oracle.set(5e17, block.timestamp - 7200, false);
        vm.prank(keeper);
        vm.expectRevert(PRICE_UNAVAILABLE.selector);
        executor.executeJob(_job(q), q, _makerRoute());

        oracle.set(5e17, block.timestamp, true);
        vm.prank(keeper);
        vm.expectRevert(PRICE_UNAVAILABLE.selector);
        executor.executeJob(_job(q), q, _makerRoute());

        oracle.set(0, block.timestamp, false);
        vm.prank(keeper);
        vm.expectRevert(PRICE_UNAVAILABLE.selector);
        executor.executeJob(_job(q), q, _makerRoute());

        oracle.set(5e17, block.timestamp, false);
        sequencer.set(false, block.timestamp);
        vm.prank(keeper);
        vm.expectRevert(SEQUENCER_UNAVAILABLE.selector);
        executor.executeJob(_job(q), q, _makerRoute());
    }

    // --- T14 ---
    function test_T14_debtBeyondBoundReverts() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        morpho.increaseDebt(morphoMarketId, borrower, 2_000);
        _dropPrice();
        vm.prank(keeper);
        vm.expectRevert(INSUFFICIENT_PROCEEDS.selector);
        executor.executeJob(_job(q), q, _makerRoute());
        assertTrue(escrow.getQuote(QuoteLib.quoteId(q)).reserved);
        assertEq(collat.balanceOf(address(morpho)), COLLATERAL);
    }

    // --- T16 ---
    function test_T16_ammInsufficientNoPartialSettle() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        _dropPrice();
        Types.Route memory ammRoute = Types.Route({kind: Types.ROUTE_AMM, amm: address(amm), minOut: 9_820});
        Types.PreviewResult memory prev = executor.previewJob(_job(q), q, ammRoute);
        assertFalse(prev.ok);
        assertEq(prev.ammEstimate, 9_820);
        vm.prank(keeper);
        vm.expectRevert(INSUFFICIENT_PROCEEDS.selector);
        executor.executeJob(_job(q), q, ammRoute);
        assertEq(collat.balanceOf(address(morpho)), COLLATERAL);
        assertTrue(escrow.getQuote(QuoteLib.quoteId(q)).reserved);
    }

    // --- T17 ---
    function test_T17_spoofCallbackAndNestedJobRevert() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        vm.expectRevert(UnexpectedCallback.selector);
        executor.settleExpectedCallback(bytes32(uint256(1)), DEBT, q, 0);

        MaliciousNestedAdapter mal = new MaliciousNestedAdapter();
        mal.arm(address(executor), _job(q), q, _makerRoute());
        // swap adapter to malicious via new market would be heavier; call executeJob while forcing stage
        // Direct nested: start a real fill cannot reenter because stage != None. Call adapter.execute from outside.
        vm.expectRevert(Unauthorized.selector);
        adapter.execute(_job(q), q, _makerRoute(), morphoMarketId);

        vm.expectRevert(UnexpectedCallback.selector);
        adapter.onMorphoLiquidate(DEBT, abi.encode(_job(q), q, _makerRoute()));
    }

    function test_T17_nestedExecuteJobFromActiveStage() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        _dropPrice();
        MaliciousNestedAdapter mal = new MaliciousNestedAdapter();
        mal.arm(address(executor), _job(q), q, _makerRoute());
        Types.Market memory m = registry.getMarket(marketKey);
        m.adapter = address(mal);
        registry.admitMarket(m, registry.getPolicy(marketKey));
        vm.prank(keeper);
        vm.expectRevert(NestedJob.selector);
        executor.executeJob(_job(q), q, _makerRoute());
    }

    // --- T22 ---
    function test_T22_pauseScopeKeepsWithdrawals() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        vm.prank(guardian);
        registry.pauseScope(marketKey);

        _dropPrice();
        vm.prank(keeper);
        vm.expectRevert(SCOPE_PAUSED.selector);
        executor.executeJob(_job(q), q, _makerRoute());

        // unreserved extra cash still withdrawable
        vm.prank(maker);
        escrow.deposit(address(debt), 500, maker);
        vm.prank(maker);
        escrow.withdraw(address(debt), 500, maker);

        // other market still executable after we unpause first? create second market
        vm.prank(guardian);
        registry.pauseScope(Types.SCOPE_RESERVATIONS);
        Types.Quote memory q2 = _quote(CASHOUT, 60);
        q2.reservationId = keccak256("other");
        vm.prank(maker);
        escrow.deposit(address(debt), CASHOUT, maker);
        vm.expectRevert(SCOPE_PAUSED.selector);
        escrow.registerQuote(q2, _sign(q2));

        vm.prank(recovery);
        registry.unpauseScope(Types.SCOPE_RESERVATIONS);
        vm.prank(recovery);
        registry.unpauseScope(marketKey);
    }

    function test_T23_timelockPolicyCannotActivateEarly() public {
        Types.Policy memory p = registry.getPolicy(marketKey);
        p.version = 2;
        p.maxQuoteLifetime = 60;
        bytes32 sid = registry.schedulePolicy(marketKey, p);
        vm.expectRevert(PolicyNotReady.selector);
        registry.activatePolicy(sid);
        vm.warp(block.timestamp + 1 hours);
        registry.activatePolicy(sid);
        assertEq(registry.getPolicy(marketKey).version, 2);
    }

    function test_previewMakerWinsOverAmmEstimate() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        _dropPrice();
        Types.PreviewResult memory makerPrev = executor.previewJob(_job(q), q, _makerRoute());
        Types.PreviewResult memory ammPrev =
            executor.previewJob(_job(q), q, Types.Route({kind: Types.ROUTE_AMM, amm: address(amm), minOut: 1}));
        assertTrue(makerPrev.ok);
        assertFalse(ammPrev.ok);
        assertEq(makerPrev.surplus, SURPLUS);
        assertEq(ammPrev.ammEstimate, 9_820);
    }

    function test_unauthorizedKeeperReverts() public {
        Types.Quote memory q = _fundAndRegister(CASHOUT);
        _dropPrice();
        vm.expectRevert(Unauthorized.selector);
        executor.executeJob(_job(q), q, _makerRoute());
    }

    function test_mutationReplayCheckDetectsWrongDomain() public {
        // Demonstrates the suite would fail if domain binding were dropped:
        // a quote signed for escrow A cannot register on escrow B.
        vm.prank(maker);
        escrow.deposit(address(debt), CASHOUT, maker);
        Types.Quote memory q = _quote(CASHOUT, 60);
        bytes memory sig = _sign(q);
        QuoteEscrow buggyTarget = new QuoteEscrow(address(this), address(registry));
        // If digest ignored verifyingContract, this would succeed. It must not.
        q.verifyingContract = address(buggyTarget);
        vm.expectRevert(InvalidSignature.selector);
        buggyTarget.registerQuote(q, sig);
    }
}
