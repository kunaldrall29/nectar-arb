// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    BadScale,
    CorporateAction,
    InsufficientCash,
    NoBid,
    PriceFuture,
    PriceNonpositive,
    PriceStale,
    SequencerDown,
    SequencerGrace,
    SessionClosed,
    Unauthorized
} from "../src/Errors.sol";
import {MockOracle, MockSequencer} from "../src/mocks/Mocks.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {NectarPropAMM} from "../src/NectarPropAMM.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {ProtocolBase} from "./Base.sol";

contract PropAndRiskTest is ProtocolBase {
    bytes32 internal corpId;

    function setUp() public override {
        super.setUp();
        corpId = keccak256("robinhood.corporate-action-session");
    }

    function test_knownHaircutAndInventoryCap() public {
        NectarPropAMM skewed = NectarPropAMM(
            factory.create(
                address(this),
                address(debt),
                address(coll),
                address(risk),
                address(oracle),
                policyId,
                updater,
                100,
                50,
                25,
                200,
                100_000
            )
        );
        debt.approve(address(skewed), 20_000);
        skewed.depositDebt(20_000);
        (uint256 debtOut, bool ok) = skewed.previewBid(10_000);
        assertTrue(ok);
        assertEq(debtOut, 9805);
        skewed.setPricing(100, 50, 25, 200, 1000);
        (, ok) = skewed.previewBid(10_000);
        assertFalse(ok);
    }

    function test_stalePriceIsNoBidAndUpdaterCannotWithdraw() public {
        uint256 before = pool.debtBalance();
        vm.warp(block.timestamp + 2 days);
        (uint256 debtOut, bool ok) = pool.previewBid(seized);
        assertFalse(ok);
        assertEq(debtOut, 0);
        vm.expectRevert(NoBid.selector);
        executor.execute(_job(NectarExecutor.RouteId.PropAMM, 0, REPAY));
        assertEq(pool.debtBalance(), before);

        vm.prank(updater);
        vm.expectRevert(Unauthorized.selector);
        pool.withdrawDebt(updater, 1);
        vm.prank(maker);
        pool.withdrawDebt(maker, 10);
        assertEq(debt.balanceOf(maker), 10);
    }

    function test_previewDoesNotMoveInventory() public {
        uint256 before = pool.collateralInventory();
        pool.previewBid(seized);
        assertEq(pool.collateralInventory(), before);
        vm.expectRevert(Unauthorized.selector);
        pool.buyCollateral(seized, 1);
    }

    function test_priceFixtures() public {
        bytes32 fresh = keccak256("fixture.fresh-120");
        risk.setPolicy(
            fresh,
            RiskGuard.Policy({
                maxStaleness: 120,
                requireSessionOpen: true,
                rejectCorporateAction: true,
                feedScale: 1e18,
                exists: true
            })
        );

        oracle.set(5e18, block.timestamp, 1e18, true, false);
        assertEq(risk.verify(fresh, address(oracle)), 5e18);

        oracle.set(1e18, block.timestamp - 10_000, 1e18, false, false);
        vm.expectRevert(PriceStale.selector);
        risk.verify(fresh, address(oracle));

        oracle.set(1e18, block.timestamp, 1e18, false, false);
        vm.expectRevert(SessionClosed.selector);
        risk.verify(corpId, address(oracle));

        oracle.set(1e18, block.timestamp, 1e18, true, true);
        vm.expectRevert(CorporateAction.selector);
        risk.verify(corpId, address(oracle));

        oracle.set(0, block.timestamp, 1e18, true, false);
        vm.expectRevert(PriceNonpositive.selector);
        risk.verify(fresh, address(oracle));

        oracle.set(-5, block.timestamp, 1e18, true, false);
        vm.expectRevert(PriceNonpositive.selector);
        risk.verify(fresh, address(oracle));

        oracle.set(1e18, block.timestamp + 5, 1e18, true, false);
        vm.expectRevert(PriceFuture.selector);
        risk.verify(fresh, address(oracle));

        oracle.set(1e18, block.timestamp, 2e18, true, false);
        vm.expectRevert(BadScale.selector);
        risk.verify(fresh, address(oracle));
    }

    function test_sequencerGrace() public {
        MockSequencer seq = new MockSequencer();
        RiskGuard guarded = new RiskGuard(address(seq), 3600);
        bytes32 id = keccak256("sequencer");
        guarded.setPolicy(
            id,
            RiskGuard.Policy({
                maxStaleness: 1 days,
                requireSessionOpen: true,
                rejectCorporateAction: true,
                feedScale: 1e18,
                exists: true
            })
        );
        oracle.set(1e18, block.timestamp, 1e18, true, false);
        seq.set(1, block.timestamp - 10);
        vm.expectRevert(SequencerDown.selector);
        guarded.verify(id, address(oracle));
        seq.set(0, block.timestamp - 10);
        vm.expectRevert(SequencerGrace.selector);
        guarded.verify(id, address(oracle));
        seq.set(0, block.timestamp - 3601);
        assertEq(guarded.verify(id, address(oracle)), 1e18);
    }

    function test_guardianPauseDoesNotChangeRecipientOrSeize() public {
        address before = executor.protocolFeeRecipient();
        vm.prank(guardian);
        registry.setExecutionPaused(true);
        assertEq(executor.protocolFeeRecipient(), before);
        vm.prank(maker);
        escrow.withdraw(address(debt), 15, maker);
        assertEq(debt.balanceOf(maker), 15);
        vm.prank(guardian);
        vm.expectRevert(InsufficientCash.selector);
        escrow.withdraw(address(debt), 1, guardian);
    }
}
