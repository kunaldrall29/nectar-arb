// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockLendingMarket} from "../src/mocks/MockLendingMarket.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {MorphoAdapter} from "../src/MorphoAdapter.sol";
import {IMarketRegistry} from "../src/interfaces/IMarketRegistry.sol";

contract DeployNectar is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        MockERC20 usdc = new MockERC20("Nectar USD", "nUSD", 6);
        MockERC20 stock = new MockERC20("Tokenized AAPL", "tAAPL", 18);
        MockLendingMarket lending = new MockLendingMarket(deployer);
        QuoteEscrow escrow = new QuoteEscrow(deployer);
        MarketRegistry registry = new MarketRegistry(deployer);
        RiskGuard guard = new RiskGuard(deployer, deployer);
        NectarExecutor executor = new NectarExecutor(deployer, address(escrow), address(registry), address(guard), deployer);
        MorphoAdapter adapter = new MorphoAdapter(address(executor), address(lending));

        escrow.setExecutor(address(executor));
        executor.setKeeper(deployer, true);

        // Seed demo prices (1e18 = $1 for debt, $190 for stock)
        guard.setPrice(address(usdc), 1e18);
        guard.setPrice(address(stock), 190e18);

        bytes32 marketKey = keccak256("ARB_SEPOLIA_MORPHO_TAAPL_NUSD_V1");
        bytes32 policyHash = keccak256("policy-v1");
        registry.admitMarket(
            IMarketRegistry.Market({
                marketKey: marketKey,
                chainId: block.chainid,
                lendingProtocol: address(lending),
                marketId: keccak256("taapl-nusd"),
                debtToken: address(usdc),
                collateralToken: address(stock),
                adapter: address(adapter),
                adapterVersion: 1,
                policyHash: policyHash,
                active: true,
                label: "tAAPL / nUSD Morpho (testnet)"
            })
        );

        // Mint demo inventory to deployer for faucet seeding
        usdc.mint(deployer, 1_000_000e6);
        stock.mint(deployer, 10_000e18);

        vm.stopBroadcast();

        console2.log("CHAIN_ID", block.chainid);
        console2.log("DEPLOYER", deployer);
        console2.log("MOCK_DEBT_TOKEN", address(usdc));
        console2.log("MOCK_COLLATERAL_TOKEN", address(stock));
        console2.log("MOCK_LENDING", address(lending));
        console2.log("QUOTE_ESCROW", address(escrow));
        console2.log("MARKET_REGISTRY", address(registry));
        console2.log("RISK_GUARD", address(guard));
        console2.log("NECTAR_EXECUTOR", address(executor));
        console2.log("MORPHO_ADAPTER", address(adapter));
        console2.logBytes32(marketKey);
    }
}