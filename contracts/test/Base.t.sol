// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TestToken} from "../src/mocks/TestToken.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {MiniMorpho} from "../src/lending/MiniMorpho.sol";
import {MarketParams} from "../src/lending/IMiniMorpho.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {MakerVault} from "../src/MakerVault.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";

abstract contract NectarBase is Test {
    uint256 internal constant USDC = 1e6;
    uint256 internal constant SHARE = 1e18;
    // $1 per 1e18 collateral base units, expressed in 6-decimal loan units, scaled 1e36
    uint256 internal constant DOLLAR_PRICE = 1e24;

    address internal gov = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal treasury = makeAddr("treasury");
    address internal keeper = makeAddr("keeper");
    address internal lender = makeAddr("lender");
    address internal borrower = makeAddr("borrower");
    uint256 internal makerPk = 0xA11CE;
    address internal maker;
    address internal makerInventory = makeAddr("makerInventory");

    TestToken internal usdc;
    TestToken internal tsla;
    MockOracle internal oracle;
    MiniMorpho internal morpho;
    MarketRegistry internal registry;
    MakerVault internal vault;
    NectarExecutor internal executor;
    MarketParams internal params;
    bytes32 internal marketKey;

    uint64 internal constant POLICY_DELAY = 48 hours;

    function setUp() public virtual {
        maker = vm.addr(makerPk);
        usdc = new TestToken("Test USD Coin", "tUSDC", 6, 10_000 * USDC, gov);
        tsla = new TestToken("Tesla Stock Token (test)", "tTSLA", 18, 10 * SHARE, gov);
        oracle = new MockOracle("tTSLA / tUSDC", 250 * DOLLAR_PRICE, false, gov);
        morpho = new MiniMorpho();
        params = MarketParams(address(usdc), address(tsla), address(oracle), 0.5e18);
        morpho.createMarket(params);

        registry = new MarketRegistry(gov, guardian, treasury, POLICY_DELAY);
        vault = new MakerVault(registry, gov);
        executor = new NectarExecutor(registry, vault);

        vm.startPrank(gov);
        vault.setExecutor(address(executor));
        vault.setCashToken(address(usdc), true);
        marketKey = registry.admitMarket(address(morpho), params, executor.ADAPTER_ID(), "tTSLA/tUSDC", _policy());
        usdc.mint(lender, 1_000_000 * USDC);
        usdc.mint(maker, 100_000 * USDC);
        tsla.mint(borrower, 100 * SHARE);
        vm.stopPrank();

        vm.startPrank(lender);
        usdc.approve(address(morpho), type(uint256).max);
        morpho.supply(params, 1_000_000 * USDC, lender);
        vm.stopPrank();

        // 100 tTSLA @ $250 = $25,000 collateral, lltv 50% => max borrow 12,500
        vm.startPrank(borrower);
        tsla.approve(address(morpho), type(uint256).max);
        morpho.supplyCollateral(params, 100 * SHARE, borrower);
        morpho.borrow(params, 12_000 * USDC, borrower, borrower);
        vm.stopPrank();

        vm.prank(maker);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _policy() internal pure returns (MarketRegistry.Policy memory) {
        return MarketRegistry.Policy({
            version: 0,
            maxQuoteLifetime: 120,
            maxPriceAge: 1 hours,
            minProtocolFeeBps: 10,
            maxQuoteCashOut: 1_000_000 * USDC
        });
    }

    /// PRD Section 9 numerical fixture: repay 10,000, cashOut 10,140, keeper 50, protocol 20, surplus 70.
    function _fixtureQuote() internal view returns (MakerVault.Quote memory q) {
        q = MakerVault.Quote({
            maker: maker,
            marketKey: marketKey,
            policyVersion: 1,
            borrower: borrower,
            collateralToken: address(tsla),
            collateralAmount: 50 * SHARE,
            debtToken: address(usdc),
            cashOut: 10_140 * USDC,
            maxDebtRepay: 10_000 * USDC,
            collateralRecipient: makerInventory,
            keeperFee: 50 * USDC,
            protocolFee: 20 * USDC,
            minNetSurplus: 70 * USDC,
            surplusRecipient: maker,
            validUntil: uint64(block.timestamp + 60),
            nonce: 1
        });
    }

    function _deposit(uint256 amount) internal {
        vm.prank(maker);
        vault.deposit(address(usdc), amount, maker);
    }

    function _sign(MakerVault.Quote memory q, uint256 pk) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, vault.quoteId(q));
        return abi.encodePacked(r, s, v);
    }

    function _register(MakerVault.Quote memory q) internal returns (bytes32) {
        bytes memory sig = _sign(q, makerPk);
        return vault.registerQuote(q, sig);
    }

    function _setPrice(uint256 dollars) internal {
        vm.prank(gov);
        oracle.setPrice(dollars * DOLLAR_PRICE);
    }

    function _job(bytes32 id) internal view returns (NectarExecutor.Job memory) {
        return NectarExecutor.Job({quoteId: id, borrower: borrower, deadline: block.timestamp + 30});
    }

    function _refusal(NectarExecutor.Refusal code) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(NectarExecutor.JobRefused.selector, code);
    }
}
