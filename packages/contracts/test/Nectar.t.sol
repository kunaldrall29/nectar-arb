// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {DemoLiquidationAdapter} from "../src/DemoLiquidationAdapter.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {FundedQuote, ExecutionJob, MarketConfig} from "../src/interfaces/INectarTypes.sol";

contract NectarTest is Test {
    QuoteEscrow escrow;
    NectarExecutor executor;
    MarketRegistry registry;
    DemoLiquidationAdapter adapter;
    MockERC20 debt;
    MockERC20 collateral;

    address gov = address(0xA11CE);
    address guardian = address(0xB0B);
    uint256 makerKey = 0x59c6995e998f97a5a0044966f094538f90b271e433246557642d812e31ce1c;
    address maker;
    address keeper = address(0xBEEF);
    address vault = address(0xDEAD);

    bytes32 marketKey = keccak256("nectar-demo-market");
    uint256 reservationId = 1;
    uint256 quoteNonce = 42;

    function setUp() public {
        maker = vm.addr(makerKey);
        escrow = new QuoteEscrow(address(0), guardian);
        registry = new MarketRegistry(gov, guardian);
        executor = new NectarExecutor(escrow, registry, guardian);
        escrow.setExecutor(address(executor));

        debt = new MockERC20("Nectar Debt", "NDEBT", 6);
        collateral = new MockERC20("Nectar Collateral", "NCOL", 6);
        adapter = new DemoLiquidationAdapter(vault, address(collateral));

        debt.mint(maker, 1_000_000e6);
        collateral.mint(address(adapter), 1_000_000e6);

        MarketConfig memory cfg = MarketConfig({
            marketKey: marketKey,
            chainId: block.chainid,
            lendingProtocol: vault,
            debtToken: address(debt),
            collateralToken: address(collateral),
            adapter: address(adapter),
            adapterVersion: 1,
            policyHash: keccak256("policy-v1"),
            active: true
        });
        vm.prank(gov);
        registry.admitMarket(cfg);
    }

    function _signQuote(FundedQuote memory q) internal view returns (bytes memory sig) {
        bytes32 digest = escrow.hashQuote(q);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerKey, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _fixtureQuote() internal view returns (FundedQuote memory q) {
        q = FundedQuote({
            schemaVersion: 1,
            chainId: block.chainid,
            verifyingContract: address(escrow),
            maker: maker,
            makerNonce: 0,
            marketKey: marketKey,
            adapterVersion: 1,
            positionKey: keccak256("position-1"),
            collateralToken: address(collateral),
            collateralAmount: 100e6,
            debtToken: address(debt),
            cashOut: 10_140e6,
            maxDebtRepay: 10_500e6,
            collateralRecipient: maker,
            keeperCompensation: 50e6,
            protocolFee: 20e6,
            minNetSurplus: 70e6,
            keeperRecipient: keeper,
            surplusRecipient: maker,
            validUntil: uint64(block.timestamp + 60),
            reservationId: reservationId,
            policyHash: keccak256("policy-v1"),
            quoteNonce: quoteNonce
        });
    }

    function testT01_depositWithdraw() public {
        vm.startPrank(maker);
        debt.approve(address(escrow), 1000e6);
        escrow.deposit(address(debt), 1000e6, maker);
        assertEq(escrow.availableCash(maker, address(debt)), 1000e6);
        escrow.withdraw(address(debt), 400e6, maker);
        assertEq(escrow.availableCash(maker, address(debt)), 600e6);
        vm.stopPrank();
    }

    function testT02_T05_reserveAndFill() public {
        vm.startPrank(maker);
        debt.approve(address(escrow), 20_000e6);
        escrow.deposit(address(debt), 20_000e6, maker);
        FundedQuote memory q = _fixtureQuote();
        bytes memory sig = _signQuote(q);
        escrow.registerQuote(q, sig);
        assertEq(escrow.availableCash(maker, address(debt)), 20_000e6 - 10_140e6);
        vm.stopPrank();

        ExecutionJob memory job = ExecutionJob({
            marketKey: marketKey,
            positionKey: q.positionKey,
            reservationId: reservationId,
            collateralAmount: 100e6,
            debtRepay: 10_000e6,
            routeType: 0,
            adapter: address(adapter)
        });

        (bool okBefore,) = executor.previewJob(job);
        assertTrue(okBefore);

        vm.prank(keeper);
        executor.executeJob(job, q);

        assertEq(debt.balanceOf(vault), 10_000e6);
        assertEq(debt.balanceOf(keeper), 50e6);
        assertEq(debt.balanceOf(maker), 1_000_000e6 - 20_000e6 + 70e6);
        assertEq(collateral.balanceOf(maker), 100e6);
    }

    function testT03_withdrawCommittedReverts() public {
        vm.startPrank(maker);
        debt.approve(address(escrow), 20_000e6);
        escrow.deposit(address(debt), 20_000e6, maker);
        FundedQuote memory q = _fixtureQuote();
        escrow.registerQuote(q, _signQuote(q));
        vm.expectRevert(QuoteEscrow.InsufficientCash.selector);
        escrow.withdraw(address(debt), 20_000e6, maker);
        vm.stopPrank();
    }

    function testT08_releaseTwiceIdempotent() public {
        vm.startPrank(maker);
        debt.approve(address(escrow), 20_000e6);
        escrow.deposit(address(debt), 20_000e6, maker);
        FundedQuote memory q = _fixtureQuote();
        q.validUntil = uint64(block.timestamp + 1);
        escrow.registerQuote(q, _signQuote(q));
        vm.stopPrank();

        vm.warp(block.timestamp + 2);
        escrow.releaseExpired(reservationId);
        uint256 avail = escrow.availableCash(maker, address(debt));
        vm.expectRevert(QuoteEscrow.ReservationAlreadyReleased.selector);
        escrow.releaseExpired(reservationId);
        assertEq(escrow.availableCash(maker, address(debt)), avail);
    }
}
