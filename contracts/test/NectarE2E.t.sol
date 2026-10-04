// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockLendingMarket} from "../src/mocks/MockLendingMarket.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {MorphoAdapter} from "../src/MorphoAdapter.sol";
import {IMarketRegistry} from "../src/interfaces/IMarketRegistry.sol";
import {IQuoteEscrow} from "../src/interfaces/IQuoteEscrow.sol";
import {INectarExecutor} from "../src/interfaces/INectarExecutor.sol";

contract NectarE2ETest is Test {
    uint256 makerPk = 0xA11CE;
    address maker;
    address keeper;
    address borrower;
    address treasury;

    MockERC20 usdc;
    MockERC20 stock;
    MockLendingMarket lending;
    QuoteEscrow escrow;
    MarketRegistry registry;
    RiskGuard guard;
    NectarExecutor executor;
    MorphoAdapter adapter;
    bytes32 marketKey;
    bytes32 policyHash;

    function setUp() public {
        maker = vm.addr(makerPk);
        keeper = makeAddr("keeper");
        borrower = makeAddr("borrower");
        treasury = makeAddr("treasury");

        usdc = new MockERC20("Nectar USD", "nUSD", 6);
        stock = new MockERC20("Tokenized AAPL", "tAAPL", 18);
        lending = new MockLendingMarket(address(this));
        escrow = new QuoteEscrow(address(this));
        registry = new MarketRegistry(address(this));
        guard = new RiskGuard(address(this), address(this));
        executor = new NectarExecutor(address(this), address(escrow), address(registry), address(guard), treasury);
        adapter = new MorphoAdapter(address(executor), address(lending));
        escrow.setExecutor(address(executor));
        executor.setKeeper(keeper, true);

        guard.setPrice(address(usdc), 1e18);
        guard.setPrice(address(stock), 190e18);

        marketKey = keccak256("TEST_MARKET");
        policyHash = keccak256("policy");
        registry.admitMarket(
            IMarketRegistry.Market({
                marketKey: marketKey,
                chainId: block.chainid,
                lendingProtocol: address(lending),
                marketId: keccak256("m1"),
                debtToken: address(usdc),
                collateralToken: address(stock),
                adapter: address(adapter),
                adapterVersion: 1,
                policyHash: policyHash,
                active: true,
                label: "test"
            })
        );

        usdc.mint(maker, 100_000e6);
        stock.mint(borrower, 100e18);
    }

    function _signQuote(IQuoteEscrow.Quote memory q) internal view returns (bytes memory) {
        bytes32 typehash = escrow.QUOTE_TYPEHASH();
        bytes32 structHash = keccak256(
            abi.encode(
                typehash,
                q.schemaVersion,
                q.chainId,
                q.verifyingContract,
                q.maker,
                q.makerNonce,
                q.marketKey,
                q.adapterVersion,
                q.borrower,
                q.collateralToken,
                q.collateralAmount,
                q.debtToken,
                q.cashOut,
                q.maxDebtRepay,
                q.collateralRecipient,
                q.keeperCompensation,
                q.protocolFee,
                q.minNetSurplus,
                q.keeperRecipient,
                q.surplusRecipient,
                q.validUntil,
                q.reservationId,
                q.policyHash,
                q.quoteNonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function testDepositWithdraw() public {
        vm.startPrank(maker);
        usdc.approve(address(escrow), 1_000e6);
        escrow.deposit(address(usdc), 1_000e6, maker);
        assertEq(escrow.availableCash(maker, address(usdc)), 1_000e6);
        escrow.withdraw(address(usdc), 400e6, maker);
        assertEq(escrow.availableCash(maker, address(usdc)), 600e6);
        vm.stopPrank();
    }

    function testReserveAndBlockEarlyWithdraw() public {
        vm.startPrank(maker);
        usdc.approve(address(escrow), 10_140e6);
        escrow.deposit(address(usdc), 10_140e6, maker);

        IQuoteEscrow.Quote memory q = _baseQuote(10_140e6, 10_000e6, 50e6, 20e6, 70e6);
        bytes memory sig = _signQuote(q);
        bytes32 quoteId = escrow.registerQuote(q, sig);
        assertEq(escrow.availableCash(maker, address(usdc)), 0);

        vm.expectRevert(QuoteEscrow.InsufficientAvailable.selector);
        escrow.withdraw(address(usdc), 1, maker);
        vm.stopPrank();

        (,, bool consumed,) = escrow.getQuote(quoteId);
        assertFalse(consumed);
    }

    function testFullLiquidationFixture() public {
        // Section 9 fixture: repay 10000, cashOut 10140, keeper 50, fee 20, surplus 70
        vm.startPrank(borrower);
        stock.approve(address(lending), 10e18);
        bytes32 positionId = lending.openPosition(borrower, address(stock), address(usdc), 10e18, 10_000e6, true);
        vm.stopPrank();

        vm.startPrank(maker);
        usdc.approve(address(escrow), 10_140e6);
        escrow.deposit(address(usdc), 10_140e6, maker);
        IQuoteEscrow.Quote memory q = _baseQuote(10_140e6, 10_000e6, 50e6, 20e6, 70e6);
        q.borrower = borrower;
        q.collateralAmount = 10e18;
        bytes memory sig = _signQuote(q);
        bytes32 quoteId = escrow.registerQuote(q, sig);
        vm.stopPrank();

        INectarExecutor.Job memory job = INectarExecutor.Job({
            marketKey: marketKey,
            positionId: positionId,
            quoteId: quoteId,
            borrower: borrower,
            collateralToken: address(stock),
            collateralAmount: 10e18,
            debtToken: address(usdc),
            maxDebtRepay: 10_000e6,
            collateralRecipient: maker,
            keeperRecipient: keeper,
            surplusRecipient: maker,
            keeperCompensation: 50e6,
            protocolFee: 20e6,
            minNetSurplus: 70e6,
            deadline: block.timestamp + 60
        });

        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        vm.prank(keeper);
        bytes32 jobId = executor.executeJob(job);
        assertTrue(jobId != bytes32(0));

        assertEq(stock.balanceOf(maker), 10e18);
        assertEq(usdc.balanceOf(keeper), 50e6);
        assertEq(usdc.balanceOf(treasury), 20e6);
        assertEq(usdc.balanceOf(maker) - makerUsdcBefore, 70e6); // surplus returned
        assertEq(escrow.cashBalance(maker, address(usdc)), 0);
        // Lending market received exactly the debt repayment
        assertEq(usdc.balanceOf(address(lending)), 10_000e6);
    }

    function testInsufficientCashOutReverts() public {
        vm.startPrank(borrower);
        stock.approve(address(lending), 10e18);
        bytes32 positionId = lending.openPosition(borrower, address(stock), address(usdc), 10e18, 10_000e6, true);
        vm.stopPrank();

        vm.startPrank(maker);
        usdc.approve(address(escrow), 10_040e6);
        escrow.deposit(address(usdc), 10_040e6, maker);
        IQuoteEscrow.Quote memory q = _baseQuote(10_040e6, 10_000e6, 50e6, 20e6, 70e6);
        q.borrower = borrower;
        q.collateralAmount = 10e18;
        // This quote itself has cashOut that cannot cover fees+surplus — registration OK, execution fails
        bytes memory sig = _signQuote(q);
        bytes32 quoteId = escrow.registerQuote(q, sig);
        vm.stopPrank();

        INectarExecutor.Job memory job = INectarExecutor.Job({
            marketKey: marketKey,
            positionId: positionId,
            quoteId: quoteId,
            borrower: borrower,
            collateralToken: address(stock),
            collateralAmount: 10e18,
            debtToken: address(usdc),
            maxDebtRepay: 10_000e6,
            collateralRecipient: maker,
            keeperRecipient: keeper,
            surplusRecipient: maker,
            keeperCompensation: 50e6,
            protocolFee: 20e6,
            minNetSurplus: 70e6,
            deadline: block.timestamp + 60
        });

        vm.prank(keeper);
        vm.expectRevert();
        executor.executeJob(job);
    }

    function testReleaseExpired() public {
        vm.startPrank(maker);
        usdc.approve(address(escrow), 1_000e6);
        escrow.deposit(address(usdc), 1_000e6, maker);
        IQuoteEscrow.Quote memory q = _baseQuote(500e6, 400e6, 10e6, 5e6, 1e6);
        bytes memory sig = _signQuote(q);
        bytes32 quoteId = escrow.registerQuote(q, sig);
        vm.stopPrank();

        vm.warp(block.timestamp + 31);
        escrow.releaseExpired(quoteId);
        assertEq(escrow.availableCash(maker, address(usdc)), 1_000e6);
    }

    function _baseQuote(
        uint256 cashOut,
        uint256 maxDebt,
        uint256 keeperComp,
        uint256 fee,
        uint256 minSurplus
    ) internal view returns (IQuoteEscrow.Quote memory q) {
        q = IQuoteEscrow.Quote({
            schemaVersion: 1,
            chainId: block.chainid,
            verifyingContract: address(escrow),
            maker: maker,
            makerNonce: escrow.nonces(maker),
            marketKey: marketKey,
            adapterVersion: 1,
            borrower: borrower,
            collateralToken: address(stock),
            collateralAmount: 1e18,
            debtToken: address(usdc),
            cashOut: cashOut,
            maxDebtRepay: maxDebt,
            collateralRecipient: maker,
            keeperCompensation: keeperComp,
            protocolFee: fee,
            minNetSurplus: minSurplus,
            keeperRecipient: keeper,
            surplusRecipient: maker,
            validUntil: block.timestamp + 30,
            reservationId: keccak256(abi.encode(maker, cashOut, block.timestamp)),
            policyHash: policyHash,
            quoteNonce: 1
        });
    }
}