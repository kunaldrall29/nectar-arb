// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    BadLifetime,
    Expired,
    FeeOnTransfer,
    InsufficientCash,
    NotExpired,
    ReservedFunds,
    ScopePaused,
    SignatureInvalid
} from "../src/Errors.sol";
import {ERC1271Wallet, FeeOnTransferToken} from "../src/mocks/Mocks.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {QuoteTypes} from "../src/libraries/QuoteTypes.sol";
import {ProtocolBase} from "./Base.sol";

contract QuoteEscrowTest is ProtocolBase {
    function test_depositCreditsBeneficiaryAndRejectsDonation() public {
        uint256 beforeLiab = escrow.liabilities(address(debt));
        debt.mint(address(escrow), 50);
        assertEq(escrow.liabilities(address(debt)), beforeLiab);
        assertEq(escrow.availableOf(address(this), address(debt)), 0);
        debt.mint(keeper, 25);
        vm.startPrank(keeper);
        debt.approve(address(escrow), 25);
        escrow.deposit(address(debt), 25, maker);
        vm.stopPrank();
        assertEq(escrow.availableOf(maker, address(debt)), 200_025);
        assertEq(escrow.availableOf(keeper, address(debt)), 0);
    }

    function test_feeOnTransferRejected() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        fee.mint(maker, 100);
        vm.startPrank(maker);
        fee.approve(address(escrow), 100);
        vm.expectRevert(FeeOnTransfer.selector);
        escrow.deposit(address(fee), 100, maker);
        vm.stopPrank();
        assertEq(escrow.liabilities(address(fee)), 0);
    }

    function test_withdrawUnreservedWhileExecutionPaused() public {
        vm.prank(guardian);
        registry.setExecutionPaused(true);
        vm.prank(maker);
        escrow.withdraw(address(debt), 40, maker);
        assertEq(debt.balanceOf(maker), 40);
        QuoteTypes.Quote memory q = _quote(maker, 1, CASH_OUT, seized);
        bytes memory pausedSig = _sign(makerPk, q);
        vm.expectRevert(ScopePaused.selector);
        escrow.registerQuote(q, pausedSig);
    }

    function test_firmQuoteCannotBeReleasedBeforeExpiry() public {
        QuoteTypes.Quote memory q = _quote(maker, 4, CASH_OUT, seized);
        escrow.registerQuote(q, _sign(makerPk, q));
        vm.expectRevert(NotExpired.selector);
        escrow.release(4);
        vm.prank(maker);
        vm.expectRevert(ReservedFunds.selector);
        escrow.withdraw(address(debt), 200_000, maker);
        assertLe(escrow.reservedTotal(address(debt)), escrow.liabilities(address(debt)));
    }

    function test_releaseAtExpiryAndFillAtValidUntilReverts() public {
        QuoteTypes.Quote memory q = _quote(maker, 5, CASH_OUT, seized);
        escrow.registerQuote(q, _sign(makerPk, q));
        vm.warp(q.validUntil);
        vm.expectRevert(Expired.selector);
        executor.execute(_job(NectarExecutor.RouteId.Quote, 5, 0));
        escrow.release(5);
        assertEq(uint8(escrow.status(5)), uint8(QuoteEscrow.Status.Released));
        vm.prank(maker);
        escrow.withdraw(address(debt), CASH_OUT, maker);
    }

    function test_lifetimeBounds() public {
        QuoteTypes.Quote memory tooLong = _quote(maker, 6, CASH_OUT, seized);
        tooLong.validUntil = uint64(block.timestamp + escrow.MAX_LIFETIME() + 1);
        bytes memory longSig = _sign(makerPk, tooLong);
        vm.expectRevert(BadLifetime.selector);
        escrow.registerQuote(tooLong, longSig);

        QuoteTypes.Quote memory maxed = _quote(maker, 6, CASH_OUT, seized);
        maxed.validUntil = uint64(block.timestamp + escrow.MAX_LIFETIME());
        escrow.registerQuote(maxed, _sign(makerPk, maxed));

        QuoteTypes.Quote memory standard = _quote(maker, 7, CASH_OUT, seized);
        assertEq(standard.validUntil, uint64(block.timestamp + escrow.DEFAULT_LIFETIME()));
        escrow.registerQuote(standard, _sign(makerPk, standard));
    }

    function test_eoaAndErc1271() public {
        QuoteTypes.Quote memory eoa = _quote(maker, 8, CASH_OUT, seized);
        escrow.registerQuote(eoa, _sign(makerPk, eoa));

        uint256 ownerPk = 0xBEEF;
        address owner = vm.addr(ownerPk);
        ERC1271Wallet wallet = new ERC1271Wallet(owner);
        escrow.deposit(address(debt), 400, address(wallet));
        QuoteTypes.Quote memory q = _quote(address(wallet), 1, 200, seized);
        escrow.registerQuote(q, _sign(ownerPk, q));

        QuoteTypes.Quote memory bad = _quote(address(wallet), 2, 300, seized);
        bytes memory badSig = _sign(ownerPk, bad);
        vm.expectRevert(InsufficientCash.selector);
        escrow.registerQuote(bad, badSig);

        QuoteTypes.Quote memory wrong = _quote(maker, 9, CASH_OUT, seized);
        bytes memory wrongSig = _sign(ownerPk, wrong);
        vm.expectRevert(SignatureInvalid.selector);
        escrow.registerQuote(wrong, wrongSig);
    }

    function test_reservedDoesNotExceedLiability() public {
        QuoteTypes.Quote memory q = _quote(maker, 10, 150_000, seized);
        escrow.registerQuote(q, _sign(makerPk, q));
        assertLe(escrow.reservedTotal(address(debt)), escrow.liabilities(address(debt)));
        assertGe(debt.balanceOf(address(escrow)), escrow.liabilities(address(debt)));
    }

    function testFuzz_withdrawOnlyAvailable(uint96 depositAmount, uint96 want) public {
        depositAmount = uint96(bound(depositAmount, 1, 1e18));
        address user = makeAddr("fuzz-user");
        debt.mint(user, depositAmount);
        vm.startPrank(user);
        debt.approve(address(escrow), depositAmount);
        escrow.deposit(address(debt), depositAmount, user);
        uint256 available = escrow.availableOf(user, address(debt));
        want = uint96(bound(want, 0, depositAmount * 2));
        if (want == 0 || want > available) {
            if (want > available && want != 0) vm.expectRevert();
            if (want == 0) vm.expectRevert();
            escrow.withdraw(address(debt), want == 0 ? 0 : want, user);
        } else {
            escrow.withdraw(address(debt), want, user);
            assertEq(escrow.availableOf(user, address(debt)), available - want);
        }
        vm.stopPrank();
        assertGe(debt.balanceOf(address(escrow)), escrow.liabilities(address(debt)));
    }
}
