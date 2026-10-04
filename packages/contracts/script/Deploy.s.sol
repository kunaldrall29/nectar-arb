// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {MockLendingMarket} from "../src/mocks/MockLendingMarket.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {MorphoAdapter} from "../src/MorphoAdapter.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feeRecipient = vm.envOr("FEE_RECIPIENT", vm.addr(deployerPrivateKey));

        vm.startBroadcast(deployerPrivateKey);

        MockERC20 debt = new MockERC20("Nectar Test USDC", "tUSDC", 6);
        MockERC20 collateral = new MockERC20("Nectar Test Collateral", "tCOL", 18);
        MockOracle oracle = new MockOracle();
        MockLendingMarket lending = new MockLendingMarket();
        MarketRegistry registry = new MarketRegistry();
        RiskGuard riskGuard = new RiskGuard(address(oracle));
        QuoteEscrow escrow = new QuoteEscrow();
        NectarExecutor executor = new NectarExecutor(address(escrow), address(riskGuard), address(registry));
        MorphoAdapter adapter = new MorphoAdapter(address(lending), address(riskGuard), address(executor), feeRecipient);

        escrow.setExecutor(address(executor));

        oracle.setPrice(address(collateral), 1e18, block.timestamp);

        bytes32 marketKey = keccak256(abi.encodePacked("nectar-demo", block.chainid));
        MarketRegistry.MarketPolicy memory policy = MarketRegistry.MarketPolicy({
            chainId: block.chainid,
            lendingMarket: address(lending),
            debtToken: address(debt),
            collateralToken: address(collateral),
            oracle: address(oracle),
            adapter: address(adapter),
            adapterVersion: 1,
            policyHash: keccak256("policy-v1-testnet"),
            active: true
        });
        registry.admitMarket(marketKey, policy);

        vm.stopBroadcast();

        console2.log("DebtToken", address(debt));
        console2.log("CollateralToken", address(collateral));
        console2.log("Oracle", address(oracle));
        console2.log("LendingMarket", address(lending));
        console2.log("MarketRegistry", address(registry));
        console2.log("RiskGuard", address(riskGuard));
        console2.log("QuoteEscrow", address(escrow));
        console2.log("NectarExecutor", address(executor));
        console2.log("MorphoAdapter", address(adapter));
        console2.log("MarketKey");
        console2.logBytes32(marketKey);
    }
}
