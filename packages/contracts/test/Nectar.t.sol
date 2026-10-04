// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {MockLendingMarket} from "../src/mocks/MockLendingMarket.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {MorphoAdapter} from "../src/MorphoAdapter.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {FundedQuote, QuoteTypes} from "../src/libraries/QuoteTypes.sol";

contract NectarTest is Test {
    MockERC20 debt;
    MockERC20 collateral;
    MockOracle oracle;
    MockLendingMarket lending;
    MarketRegistry registry;
    RiskGuard riskGuard;
    QuoteEscrow escrow;
    MorphoAdapter adapter;
    NectarExecutor executor;

    address maker;
    address borrower = address(0xB0B0);
    address keeper = address(0xE0E0);
    address feeRecipient = address(0xFEE1);
    bytes32 marketKey = keccak256("test-market");

    uint256 makerPk = 0xA11CE;

    function setUp() public {
        maker = vm.addr(makerPk);

        debt = new MockERC20("Debt", "DEBT", 6);
        collateral = new MockERC20("Collateral", "COL", 18);
        oracle = new MockOracle();
        lending = new MockLendingMarket();
        registry = new MarketRegistry();
        riskGuard = new RiskGuard(address(oracle));
        escrow = new QuoteEscrow();
        executor = new NectarExecutor(address(escrow), address(riskGuard), address(registry));
        adapter = new MorphoAdapter(address(lending), address(riskGuard), address(executor), feeRecipient);

        escrow.setExecutor(address(executor));

        oracle.setPrice(address(collateral), 1e18, block.timestamp);

        MarketRegistry.MarketPolicy memory policy = MarketRegistry.MarketPolicy({
            chainId: block.chainid,
            lendingMarket: address(lending),
            debtToken: address(debt),
            collateralToken: address(collateral),
            oracle: address(oracle),
            adapter: address(adapter),
            adapterVersion: 1,
            policyHash: keccak256("policy-v1"),
            active: true
        });
        registry.admitMarket(marketKey, policy);

        debt.mint(maker, 1_000_000e6);
        debt.mint(borrower, 100_000e6);
        collateral.mint(borrower, 100e18);

        vm.startPrank(borrower);
        collateral.approve(address(lending), type(uint256).max);
        debt.approve(address(lending), type(uint256).max);
        lending.openPosition(borrower, address(collateral), address(debt), 10e18, 10_000e6);
        vm.stopPrank();
    }

    function testDepositWithdrawConservation() public {
        vm.startPrank(maker);
        debt.approve(address(escrow), 5000e6);
        escrow.deposit(address(debt), 5000e6, maker);
        assertEq(escrow.available(maker, address(debt)), 5000e6);
        escrow.withdraw(address(debt), 2000e6, maker);
        assertEq(escrow.available(maker, address(debt)), 3000e6);
        vm.stopPrank();
        assertEq(debt.balanceOf(address(escrow)), 3000e6);
    }

    function testQuoteLifecycleAndSettlementFixture() public {
        uint256 cashOut = 10_140e6;
        uint256 debtRepay = 10_000e6;
        uint256 keeperFee = 50e6;
        uint256 protocolFee = 20e6;
        uint256 surplus = 70e6;

        vm.startPrank(maker);
        debt.approve(address(escrow), cashOut);
        escrow.deposit(address(debt), cashOut, maker);

        bytes32 reservationId = keccak256("res-1");
        FundedQuote memory quote = FundedQuote({
            schemaVersion: 1,
            chainId: block.chainid,
            verifyingContract: address(escrow),
            maker: maker,
            makerNonce: 0,
            marketKey: marketKey,
            adapterVersion: 1,
            borrower: borrower,
            collateralToken: address(collateral),
            collateralAmount: 1e18,
            debtToken: address(debt),
            cashOut: cashOut,
            maxDebtRepay: debtRepay,
            collateralRecipient: maker,
            keeperCompensation: keeperFee,
            protocolFee: protocolFee,
            minNetSurplus: surplus,
            keeperRecipient: keeper,
            surplusRecipient: maker,
            validUntil: block.timestamp + 120,
            reservationId: reservationId,
            policyHash: keccak256("policy-v1"),
            quoteNonce: keccak256("q1")
        });

        bytes32 digest = escrow.hashQuote(quote);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
        escrow.registerQuote(quote, abi.encodePacked(r, s, v));
        assertEq(escrow.reserved(maker, address(debt)), cashOut);
        vm.stopPrank();

        vm.prank(keeper);
        NectarExecutor.JobRoute memory route = NectarExecutor.JobRoute({
            marketKey: marketKey,
            borrower: borrower,
            collateralAmount: 1e18,
            maxDebtRepay: debtRepay,
            reservationId: reservationId,
            deadline: block.timestamp + 120,
            collateralRecipient: maker,
            keeperCompensation: keeperFee,
            protocolFee: protocolFee,
            keeperRecipient: keeper,
            surplusRecipient: maker,
            minNetSurplus: surplus
        });
        executor.executeJob(route);

        assertEq(debt.balanceOf(keeper), keeperFee);
        assertEq(debt.balanceOf(feeRecipient), protocolFee);
        assertEq(collateral.balanceOf(maker), 1e18);
        assertEq(escrow.reserved(maker, address(debt)), 0);
    }

    function testCannotWithdrawReserved() public {
        vm.startPrank(maker);
        debt.approve(address(escrow), 1000e6);
        escrow.deposit(address(debt), 1000e6, maker);
        bytes32 reservationId = keccak256("res-2");
        FundedQuote memory quote = _minimalQuote(reservationId, 600e6);
        bytes32 digest = escrow.hashQuote(quote);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
        escrow.registerQuote(quote, abi.encodePacked(r, s, v));
        vm.expectRevert(QuoteEscrow.InsufficientAvailable.selector);
        escrow.withdraw(address(debt), 500e6, maker);
        vm.stopPrank();
    }

    function _minimalQuote(bytes32 reservationId, uint256 cashOut) internal view returns (FundedQuote memory) {
        return FundedQuote({
            schemaVersion: 1,
            chainId: block.chainid,
            verifyingContract: address(escrow),
            maker: maker,
            makerNonce: 0,
            marketKey: marketKey,
            adapterVersion: 1,
            borrower: borrower,
            collateralToken: address(collateral),
            collateralAmount: 1e18,
            debtToken: address(debt),
            cashOut: cashOut,
            maxDebtRepay: cashOut,
            collateralRecipient: maker,
            keeperCompensation: 0,
            protocolFee: 0,
            minNetSurplus: 0,
            keeperRecipient: keeper,
            surplusRecipient: maker,
            validUntil: block.timestamp + 120,
            reservationId: reservationId,
            policyHash: keccak256("policy-v1"),
            quoteNonce: keccak256("q2")
        });
    }
}
