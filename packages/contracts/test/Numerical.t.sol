// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {InsufficientProceeds} from "../src/Errors.sol";
import {BidMath} from "../src/libraries/BidMath.sol";
import {QuoteTypes} from "../src/libraries/QuoteTypes.sol";
import {RouteLib} from "../src/libraries/RouteLib.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {ProtocolBase} from "./Base.sol";

contract NumericalTest is ProtocolBase {
    function test_quoteAllocationSumsTo10140() public {
        uint256 morphoBefore = debt.balanceOf(address(morpho));
        _register(1, CASH_OUT, seized);
        executor.execute(_job(NectarExecutor.RouteId.Quote, 1, 0));

        assertEq(debt.balanceOf(address(morpho)) - morphoBefore, REPAY);
        assertEq(debt.balanceOf(keeper), KEEPER_FEE);
        assertEq(debt.balanceOf(feeSink), PROTOCOL_FEE);
        assertEq(debt.balanceOf(surplusTo), MIN_SURPLUS);
        assertEq(REPAY + KEEPER_FEE + PROTOCOL_FEE + MIN_SURPLUS, CASH_OUT);
        assertEq(coll.balanceOf(maker), seized);
        assertEq(debt.balanceOf(address(executor)), 0);
        assertEq(debt.balanceOf(address(adapter)), 0);
        assertEq(coll.balanceOf(address(executor)), 0);
        assertEq(executor.protocolFeeRecipient(), feeSink);
    }

    function test_quote10040FailsAllocation() public {
        assertFalse(RouteLib.allocationWorks(10_040, REPAY, KEEPER_FEE, PROTOCOL_FEE, MIN_SURPLUS));
        _register(2, 10_040, seized);
        vm.expectRevert(InsufficientProceeds.selector);
        executor.execute(_job(NectarExecutor.RouteId.Quote, 2, 0));
        (, uint256 reserved) = escrow.accountOf(maker, address(debt));
        assertEq(reserved, 10_040);
        assertEq(uint8(escrow.status(2)), uint8(QuoteEscrow.Status.Active));
    }

    function test_external9820RejectedWhen10000Required() public {
        router.setOut(9820);
        uint256 morphoBefore = debt.balanceOf(address(morpho));
        vm.expectRevert(InsufficientProceeds.selector);
        executor.execute(_job(NectarExecutor.RouteId.External, 0, REPAY));
        assertEq(debt.balanceOf(address(morpho)), morphoBefore);
        assertEq(debt.balanceOf(keeper), 0);
    }

    function test_externalBeatsBothNectarRoutes() public {
        (uint256 propOut, bool propOk) = pool.previewBid(seized);
        assertTrue(propOk);
        assertGt(propOut, REPAY);
        assertTrue(RouteLib.allocationWorks(CASH_OUT, REPAY, KEEPER_FEE, PROTOCOL_FEE, MIN_SURPLUS));
        assertGt(propOut, CASH_OUT);

        (uint8 route, uint256 best) = executor.selectRoute(REPAY, CASH_OUT, true, propOut, true, 12_000, true);
        assertEq(route, 3);
        assertEq(best, 12_000);

        _register(3, CASH_OUT, seized);
        uint256 poolBefore = pool.debtBalance();
        router.setOut(12_000);
        executor.execute(_job(NectarExecutor.RouteId.External, 0, REPAY));

        assertEq(uint8(escrow.status(3)), uint8(QuoteEscrow.Status.Active));
        assertEq(pool.debtBalance(), poolBefore);
        assertEq(debt.balanceOf(keeper), KEEPER_FEE);
        assertEq(debt.balanceOf(feeSink), PROTOCOL_FEE);
        assertEq(debt.balanceOf(surplusTo), 12_000 - REPAY - KEEPER_FEE - PROTOCOL_FEE);
        assertEq(debt.balanceOf(address(executor)), 0);
    }

    function test_propRouteSellsCollateralWithoutPrefundedAdapter() public {
        assertEq(debt.balanceOf(address(adapter)), 0);
        uint256 poolDebt = pool.debtBalance();
        uint256 inventory = pool.collateralInventory();
        executor.execute(_job(NectarExecutor.RouteId.PropAMM, 0, REPAY));
        assertEq(pool.collateralInventory(), inventory + seized);
        assertLt(pool.debtBalance(), poolDebt);
        assertEq(debt.balanceOf(keeper), KEEPER_FEE);
        assertEq(debt.balanceOf(address(adapter)), 0);
        assertEq(debt.balanceOf(address(executor)), 0);
        assertFalse(morpho.officialMorphoDeployment());
    }

    function testFuzz_shortExternalNeverSelected(uint256 out) public pure {
        out = bound(out, 0, 9_999);
        (uint8 route,) = RouteLib.select(
            REPAY,
            RouteLib.Offer({debtOut: CASH_OUT, live: true}),
            RouteLib.Offer({debtOut: 10_500, live: true}),
            RouteLib.Offer({debtOut: out, live: true})
        );
        assertTrue(route != 3);
    }

    function testFuzz_bidFloors(uint128 amount, uint16 haircutBps) public pure {
        amount = uint128(bound(amount, 1, 1e24));
        haircutBps = uint16(bound(haircutBps, 0, 9_999));
        (uint256 debtOut,, bool ok) = BidMath.quote(amount, 1e18, 1, 100, haircutBps, 0, 0, 0);
        uint256 fullValue = Math.mulDiv(uint256(amount), 1e18, 1e18);
        if (!ok) return;
        assertLe(debtOut, fullValue);
        assertEq(debtOut, Math.mulDiv(fullValue, 10_000 - haircutBps, 10_000));
    }

    function _register(uint256 nonce, uint256 cashOut, uint256 collateralAmount) internal {
        QuoteTypes.Quote memory q = _quote(maker, nonce, cashOut, collateralAmount);
        escrow.registerQuote(q, _sign(makerPk, q));
    }
}
