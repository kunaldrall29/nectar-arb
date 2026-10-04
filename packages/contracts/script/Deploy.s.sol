// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {DemoLiquidationAdapter} from "../src/DemoLiquidationAdapter.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MarketConfig} from "../src/interfaces/INectarTypes.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address guardian = deployer;
        address gov = deployer;

        vm.startBroadcast(deployerKey);

        QuoteEscrow escrow = new QuoteEscrow(address(0), guardian);
        MarketRegistry registry = new MarketRegistry(gov, guardian);
        NectarExecutor executor = new NectarExecutor(escrow, registry, guardian);
        escrow.setExecutor(address(executor));

        MockERC20 debt = new MockERC20("Nectar Test USDC", "tUSDC", 6);
        MockERC20 collateral = new MockERC20("Nectar Test Collateral", "tCOL", 6);
        address vault = address(uint160(uint256(keccak256("nectar-debt-vault"))));
        DemoLiquidationAdapter adapter = new DemoLiquidationAdapter(vault, address(collateral));

        bytes32 marketKey = keccak256(abi.encodePacked("nectar-arb-sepolia-v1", block.chainid));
        MarketConfig memory cfg = MarketConfig({
            marketKey: marketKey,
            chainId: block.chainid,
            lendingProtocol: vault,
            debtToken: address(debt),
            collateralToken: address(collateral),
            adapter: address(adapter),
            adapterVersion: 1,
            policyHash: keccak256("nectar-policy-v1"),
            active: true
        });
        registry.admitMarket(cfg);

        collateral.mint(address(adapter), 1_000_000_000e6);
        debt.mint(deployer, 10_000_000e6);

        vm.stopBroadcast();

        console2.log("CHAIN_ID", block.chainid);
        console2.log("ESCROW", address(escrow));
        console2.log("EXECUTOR", address(executor));
        console2.log("REGISTRY", address(registry));
        console2.log("ADAPTER", address(adapter));
        console2.log("DEBT_TOKEN", address(debt));
        console2.log("COLLATERAL_TOKEN", address(collateral));
        console2.log("MARKET_KEY", vm.toString(marketKey));
    }
}
