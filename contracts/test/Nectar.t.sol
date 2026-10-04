// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {
    BadLifetime,
    CollateralMismatch,
    Expired,
    FeeOnTransfer,
    Ineligible,
    InsufficientCash,
    InsufficientProceeds,
    MaxDebtExceeded,
    NotActive,
    NotExpired,
    PriceStale,
    PriceUnavailable,
    ReservedFunds,
    ScopePaused,
    SignatureInvalid
} from "../src/Errors.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {NectarEscrow} from "../src/NectarEscrow.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {NectarQuotes} from "../src/NectarQuotes.sol";
import {PauseGuardian} from "../src/PauseGuardian.sol";
import {QuoteLib} from "../src/QuoteLib.sol";
import {RehearsalMarket} from "../src/RehearsalMarket.sol";

contract FeeOnTransferToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }
}

contract NectarTest is Test {
    uint256 internal constant U = 1e6;
    uint256 internal constant DEBT = 10_000 * U;
    uint256 internal constant CASH_OUT = 10_140 * U;
    uint256 internal constant KEEPER_FEE = 50 * U;
    uint256 internal constant PROTOCOL_FEE = 20 * U;
    uint256 internal constant MIN_SURPLUS = 70 * U;

    MockERC20 internal debt;
    MockERC20 internal coll;
    PauseGuardian internal pause;
    RehearsalMarket internal market;
    NectarEscrow internal escrow;
    NectarQuotes internal quotes;
    NectarExecutor internal executor;

    uint256 internal makerPk;
    address internal maker;
    uint256 internal maker2Pk;
    address internal maker2;
    address internal keeper;
    address internal borrower;
    address internal feeSink;
    address internal guardian;

    function setUp() public {
        makerPk = 0xA11CE;
        maker = vm.addr(makerPk);
        maker2Pk = 0xB0B;
        maker2 = vm.addr(maker2Pk);
        keeper = makeAddr("keeper");
        borrower = makeAddr("borrower");
        feeSink = makeAddr("fee");
        guardian = makeAddr("guardian");

        debt = new MockERC20("Nectar Rehearsal USD", "nUSD", 6, 100_000 * U);
        coll = new MockERC20("Nectar Rehearsal Collateral", "nSTK", 18, 1_000 ether);
        pause = new PauseGuardian(guardian);
        market = new RehearsalMarket(
            address(debt),
            address(coll),
            address(this),
            8_000,
            500,
            2e6,
            30,
            "Nectar rehearsal market"
        );
        escrow = new NectarEscrow(address(pause));
        quotes = new NectarQuotes(address(escrow), address(market), address(pause));
        executor = new NectarExecutor(address(escrow), address(quotes), address(market), address(pause), feeSink);
        escrow.wire(address(quotes), address(executor));
        quotes.setExecutor(address(executor));

        debt.mint(address(this), 50_000 * U);
        coll.mint(address(this), 50_000 ether);
        debt.approve(address(market), type(uint256).max);
        coll.approve(address(market), type(uint256).max);
        market.supply(30_000 * U);
        market.openRehearsalPosition(borrower, 12_000 ether, DEBT);
    }

    function test_depositAndWithdrawUnreserved() public {
        debt.mint(maker, 1_000 * U);
        vm.startPrank(maker);
        debt.approve(address(escrow), 1_000 * U);
        escrow.deposit(address(debt), 1_000 * U, maker);
        assertEq(escrow.availableOf(maker, address(debt)), 1_000 * U);
        escrow.withdraw(address(debt), 400 * U, maker);
        vm.stopPrank();

        (uint256 cash, uint256 reserved) = escrow.accountOf(maker, address(debt));
        assertEq(cash, 600 * U);
        assertEq(reserved, 0);
        assertEq(debt.balanceOf(maker), 400 * U);
        assertEq(debt.balanceOf(address(escrow)), 600 * U);
        assertEq(escrow.liabilities(address(debt)), 600 * U);
    }

    function test_depositCreditsBeneficiaryNotPayer() public {
        debt.mint(address(this), 250 * U);
        debt.approve(address(escrow), 250 * U);
        escrow.deposit(address(debt), 250 * U, maker);
        assertEq(escrow.availableOf(maker, address(debt)), 250 * U);
        assertEq(escrow.availableOf(address(this), address(debt)), 0);
        vm.expectRevert(InsufficientCash.selector);
        escrow.withdraw(address(debt), 1, address(this));
        vm.prank(maker);
        escrow.withdraw(address(debt), 250 * U, maker);
    }

    function test_cannotWithdrawReservedFunds() public {
        _deposit(maker, makerPk, 1_000 * U);
        QuoteLib.Quote memory q = _shell(maker, 1, 600 * U);
        quotes.registerQuote(q, _sign(makerPk, q));

        vm.startPrank(maker);
        vm.expectRevert(ReservedFunds.selector);
        escrow.withdraw(address(debt), 401 * U, maker);
        escrow.withdraw(address(debt), 400 * U, maker);
        vm.expectRevert(ReservedFunds.selector);
        escrow.withdraw(address(debt), 1, maker);
        vm.stopPrank();

        (uint256 cash, uint256 reserved) = escrow.accountOf(maker, address(debt));
        assertEq(cash, 600 * U);
        assertEq(reserved, 600 * U);
        assertEq(escrow.availableOf(maker, address(debt)), 0);
    }

    function test_registrationReservesFullCashOut() public {
        _deposit(maker, makerPk, CASH_OUT);
        market.setPrice(1e6);
        QuoteLib.Quote memory q = _liquidatableQuote(maker, 1);
        quotes.registerQuote(q, _sign(makerPk, q));
        assertEq(escrow.availableOf(maker, address(debt)), 0);
        (uint256 cash, uint256 reserved) = escrow.accountOf(maker, address(debt));
        assertEq(cash, CASH_OUT);
        assertEq(reserved, CASH_OUT);
        assertEq(uint8(quotes.status(q.reservationId)), uint8(NectarQuotes.Status.Active));
    }

    function test_insufficientCashRevertsWithoutPartialReserve() public {
        _deposit(maker, makerPk, 100 * U);
        QuoteLib.Quote memory q = _shell(maker, 7, 200 * U);
        bytes memory tooBig = _sign(makerPk, q);
        vm.expectRevert(InsufficientCash.selector);
        quotes.registerQuote(q, tooBig);
        (uint256 cash, uint256 reserved) = escrow.accountOf(maker, address(debt));
        assertEq(cash, 100 * U);
        assertEq(reserved, 0);
        assertTrue(!quotes.usedNonce(maker, 7));

        q.cashOut = 100 * U;
        q.maxDebtRepay = 100 * U;
        quotes.registerQuote(q, _sign(makerPk, q));
        (, reserved) = escrow.accountOf(maker, address(debt));
        assertEq(reserved, 100 * U);
    }

    function test_makerIsolation() public {
        _deposit(maker, makerPk, 1_000 * U);
        _deposit(maker2, maker2Pk, 800 * U);
        QuoteLib.Quote memory q = _shell(maker, 1, 600 * U);
        quotes.registerQuote(q, _sign(makerPk, q));

        vm.prank(maker2);
        escrow.withdraw(address(debt), 800 * U, maker2);
        assertEq(escrow.availableOf(maker2, address(debt)), 0);
        assertEq(escrow.availableOf(maker, address(debt)), 400 * U);

        vm.prank(maker2);
        vm.expectRevert(InsufficientCash.selector);
        escrow.withdraw(address(debt), 1, maker2);

        QuoteLib.Quote memory stolen = q;
        stolen.maker = maker;
        stolen.makerNonce = 2;
        stolen.quoteNonce = 2;
        stolen.reservationId = 2;
        bytes memory forged = _sign(maker2Pk, stolen);
        vm.expectRevert(SignatureInvalid.selector);
        quotes.registerQuote(stolen, forged);
        assertEq(escrow.availableOf(maker, address(debt)), 400 * U);
    }

    function test_happyPathLiquidationSettlesExactAmounts() public {
        _deposit(maker2, maker2Pk, 5_000 * U);
        _deposit(maker, makerPk, CASH_OUT);
        market.setPrice(1e6);
        QuoteLib.Quote memory q = _liquidatableQuote(maker, 1);
        uint256 seize = q.collateralAmount;
        quotes.registerQuote(q, _sign(makerPk, q));

        uint256 marketBefore = debt.balanceOf(address(market));
        vm.prank(keeper);
        executor.execute(q);

        assertEq(uint8(quotes.status(q.reservationId)), uint8(NectarQuotes.Status.Filled));
        assertEq(market.debtOf(borrower), 0);
        assertEq(market.collateralOf(borrower), 12_000 ether - seize);
        assertEq(debt.balanceOf(address(market)), marketBefore + DEBT);
        assertEq(coll.balanceOf(q.collateralRecipient), seize);
        assertEq(debt.balanceOf(q.keeperRecipient), KEEPER_FEE);
        assertEq(debt.balanceOf(feeSink), PROTOCOL_FEE);
        assertEq(debt.balanceOf(q.surplusRecipient), MIN_SURPLUS);
        assertEq(escrow.availableOf(maker, address(debt)), 0);
        assertEq(debt.balanceOf(address(escrow)), 5_000 * U);
        assertEq(escrow.liabilities(address(debt)), 5_000 * U);
        assertEq(debt.balanceOf(address(executor)), 0);
        assertEq(coll.balanceOf(address(executor)), 0);
        assertEq(DEBT + KEEPER_FEE + PROTOCOL_FEE + MIN_SURPLUS, CASH_OUT);
        assertEq(seize, 10_500 ether);

        vm.prank(keeper);
        vm.expectRevert(NotActive.selector);
        executor.execute(q);
        assertEq(escrow.availableOf(maker2, address(debt)), 5_000 * U);
    }

    function test_shortCashOutReverts() public {
        uint256 short = 10_040 * U;
        _deposit(maker, makerPk, short);
        market.setPrice(1e6);
        QuoteLib.Quote memory q = _liquidatableQuote(maker, 1);
        q.cashOut = short;
        quotes.registerQuote(q, _sign(makerPk, q));
        vm.prank(keeper);
        vm.expectRevert(InsufficientProceeds.selector);
        executor.execute(q);
        assertEq(uint8(quotes.status(q.reservationId)), uint8(NectarQuotes.Status.Active));
        assertEq(escrow.availableOf(maker, address(debt)), 0);
        assertEq(market.debtOf(borrower), DEBT);
    }

    function test_expiredQuoteRevertsAndCanBeReleased() public {
        _deposit(maker, makerPk, 1_000 * U);
        QuoteLib.Quote memory q = _shell(maker, 1, 600 * U);
        quotes.registerQuote(q, _sign(makerPk, q));
        vm.warp(q.validUntil);
        vm.prank(keeper);
        vm.expectRevert(Expired.selector);
        executor.execute(q);
        assertEq(escrow.availableOf(maker, address(debt)), 400 * U);

        quotes.releaseExpired(q.reservationId);
        assertEq(escrow.availableOf(maker, address(debt)), 1_000 * U);
        vm.expectRevert(NotActive.selector);
        quotes.releaseExpired(q.reservationId);
        assertEq(escrow.availableOf(maker, address(debt)), 1_000 * U);

        vm.prank(maker);
        escrow.withdraw(address(debt), 1_000 * U, maker);
        assertEq(debt.balanceOf(maker), 1_000 * U);
    }

    function test_releaseBeforeExpiryReverts() public {
        _deposit(maker, makerPk, 100 * U);
        QuoteLib.Quote memory q = _shell(maker, 1, 100 * U);
        quotes.registerQuote(q, _sign(makerPk, q));
        vm.expectRevert(NotExpired.selector);
        quotes.releaseExpired(q.reservationId);
        assertEq(escrow.availableOf(maker, address(debt)), 0);
    }

    function test_ineligiblePositionReverts() public {
        _deposit(maker, makerPk, CASH_OUT);
        QuoteLib.Quote memory q = _liquidatableQuote(maker, 1);
        quotes.registerQuote(q, _sign(makerPk, q));
        assertFalse(market.isLiquidatable(borrower));
        vm.prank(keeper);
        vm.expectRevert(Ineligible.selector);
        executor.execute(q);
        assertEq(market.debtOf(borrower), DEBT);
        assertEq(escrow.availableOf(maker, address(debt)), 0);
    }

    function test_stalePriceReverts() public {
        _deposit(maker, makerPk, CASH_OUT);
        market.setPrice(1e6);
        QuoteLib.Quote memory q = _liquidatableQuote(maker, 1);
        quotes.registerQuote(q, _sign(makerPk, q));
        vm.warp(block.timestamp + 31);
        assertLt(block.timestamp, q.validUntil);
        vm.prank(keeper);
        vm.expectRevert(PriceStale.selector);
        executor.execute(q);
        assertEq(uint8(quotes.status(q.reservationId)), uint8(NectarQuotes.Status.Active));
    }

    function test_unavailablePriceReverts() public {
        _deposit(maker, makerPk, CASH_OUT);
        market.setPrice(1e6);
        QuoteLib.Quote memory q = _liquidatableQuote(maker, 1);
        quotes.registerQuote(q, _sign(makerPk, q));
        market.markPriceUnavailable();
        vm.prank(keeper);
        vm.expectRevert(PriceUnavailable.selector);
        executor.execute(q);
        assertEq(debt.balanceOf(address(executor)), 0);
        assertEq(market.debtOf(borrower), DEBT);
    }

    function test_maxDebtBoundReverts() public {
        _deposit(maker, makerPk, CASH_OUT);
        market.setPrice(1e6);
        QuoteLib.Quote memory q = _liquidatableQuote(maker, 1);
        q.maxDebtRepay = DEBT - 1;
        quotes.registerQuote(q, _sign(makerPk, q));
        vm.prank(keeper);
        vm.expectRevert(MaxDebtExceeded.selector);
        executor.execute(q);
    }

    function test_badCollateralAmountReverts() public {
        _deposit(maker, makerPk, CASH_OUT);
        market.setPrice(1e6);
        QuoteLib.Quote memory q = _liquidatableQuote(maker, 1);
        q.collateralAmount = q.collateralAmount - 1;
        quotes.registerQuote(q, _sign(makerPk, q));
        vm.prank(keeper);
        vm.expectRevert(CollateralMismatch.selector);
        executor.execute(q);
    }

    function test_alteredRecipientRejected() public {
        _deposit(maker, makerPk, 100 * U);
        QuoteLib.Quote memory q = _shell(maker, 1, 100 * U);
        bytes memory sig = _sign(makerPk, q);
        q.collateralRecipient = keeper;
        vm.expectRevert(SignatureInvalid.selector);
        quotes.registerQuote(q, sig);
        assertEq(escrow.availableOf(maker, address(debt)), 100 * U);
    }

    function test_wrongChainDomainRejected() public {
        _deposit(maker, makerPk, 100 * U);
        QuoteLib.Quote memory q = _shell(maker, 1, 100 * U);
        bytes32 wrongDomain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("NectarQuotes")),
                keccak256(bytes("1")),
                block.chainid + 1,
                address(quotes)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", wrongDomain, QuoteLib.hash(q)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
        vm.expectRevert(SignatureInvalid.selector);
        quotes.registerQuote(q, abi.encodePacked(r, s, v));
    }

    function test_domainSeparatorBindsThisChain() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("NectarQuotes")),
                keccak256(bytes("1")),
                block.chainid,
                address(quotes)
            )
        );
        assertEq(quotes.domainSeparator(), expected);
    }

    function test_quoteLifetimeCap() public {
        _deposit(maker, makerPk, 100 * U);
        QuoteLib.Quote memory q = _shell(maker, 1, 100 * U);
        q.validUntil = uint64(block.timestamp + 121);
        bytes memory sig = _sign(makerPk, q);
        vm.expectRevert(BadLifetime.selector);
        quotes.registerQuote(q, sig);
    }

    function test_pauseBlocksRiskButNotWithdrawal() public {
        _deposit(maker, makerPk, 1_000 * U);
        QuoteLib.Quote memory q = _shell(maker, 1, 600 * U);
        quotes.registerQuote(q, _sign(makerPk, q));
        vm.prank(guardian);
        pause.pause();

        QuoteLib.Quote memory q2 = _shell(maker, 2, 100 * U);
        bytes memory sig2 = _sign(makerPk, q2);
        vm.expectRevert(ScopePaused.selector);
        quotes.registerQuote(q2, sig2);

        vm.prank(keeper);
        vm.expectRevert(ScopePaused.selector);
        executor.execute(q);

        vm.prank(maker);
        escrow.withdraw(address(debt), 400 * U, maker);
        assertEq(debt.balanceOf(maker), 400 * U);
        assertEq(escrow.availableOf(maker, address(debt)), 0);
    }

    function test_feeOnTransferDepositReverts() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        fee.mint(maker, 10 ether);
        vm.startPrank(maker);
        fee.approve(address(escrow), 10 ether);
        vm.expectRevert(FeeOnTransfer.selector);
        escrow.deposit(address(fee), 10 ether, maker);
        vm.stopPrank();
        assertEq(escrow.liabilities(address(fee)), 0);
    }

    function testFuzz_depositWithdrawConserves(uint96 raw) public {
        uint256 amount = bound(raw, 1, 1e24);
        debt.mint(maker, amount);
        vm.startPrank(maker);
        debt.approve(address(escrow), amount);
        escrow.deposit(address(debt), amount, maker);
        escrow.withdraw(address(debt), amount, maker);
        vm.stopPrank();
        assertEq(debt.balanceOf(maker), amount);
        assertEq(debt.balanceOf(address(escrow)), 0);
        assertEq(escrow.liabilities(address(debt)), 0);
    }

    function _deposit(address who, uint256 pk, uint256 amount) internal {
        pk;
        debt.mint(who, amount);
        vm.startPrank(who);
        debt.approve(address(escrow), amount);
        escrow.deposit(address(debt), amount, who);
        vm.stopPrank();
    }

    function _shell(address who, uint256 nonce, uint256 cashOut) internal view returns (QuoteLib.Quote memory q) {
        q.schemaVersion = 1;
        q.maker = who;
        q.makerNonce = nonce;
        q.marketKey = market.marketKey();
        q.adapterVersion = 1;
        q.borrower = borrower;
        q.collateralToken = address(coll);
        q.collateralAmount = 1;
        q.debtToken = address(debt);
        q.cashOut = cashOut;
        q.maxDebtRepay = cashOut;
        q.collateralRecipient = who;
        q.keeperCompensation = 0;
        q.protocolFee = 0;
        q.minNetSurplus = 0;
        q.keeperRecipient = keeper;
        q.surplusRecipient = who;
        q.validUntil = uint64(block.timestamp + 90);
        q.reservationId = nonce;
        q.policyHash = market.policyHash();
        q.quoteNonce = nonce;
    }

    function _liquidatableQuote(address who, uint256 nonce) internal view returns (QuoteLib.Quote memory q) {
        q = _shell(who, nonce, CASH_OUT);
        q.collateralAmount = market.seizureFor(DEBT);
        q.maxDebtRepay = DEBT;
        q.keeperCompensation = KEEPER_FEE;
        q.protocolFee = PROTOCOL_FEE;
        q.minNetSurplus = MIN_SURPLUS;
        q.keeperRecipient = keeper;
    }

    function _sign(uint256 pk, QuoteLib.Quote memory q) internal view returns (bytes memory) {
        bytes32 digest = quotes.hashTypedData(q);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
