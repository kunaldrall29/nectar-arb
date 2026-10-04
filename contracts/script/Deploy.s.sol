// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Types} from "../src/Types.sol";
import {QuoteLib} from "../src/libraries/QuoteLib.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {MorphoBlueAdapter} from "../src/adapters/MorphoBlueAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {MockSequencer} from "../src/mocks/MockSequencer.sol";
import {MockMorpho} from "../src/mocks/MockMorpho.sol";
import {MockAMM} from "../src/mocks/MockAMM.sol";

contract DeployScript is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        MockERC20 debt = new MockERC20("Nectar Mock USDC", "nmUSDC", 6);
        MockERC20 collat = new MockERC20("Nectar Mock Stock", "nmSTK", 18);
        MockOracle oracle = new MockOracle(1e18, keccak256("nmSTK/USD"));
        MockSequencer sequencer = new MockSequencer();
        MockMorpho morpho = new MockMorpho();
        MockAMM amm = new MockAMM();

        MarketRegistry registry = new MarketRegistry(deployer, deployer, deployer, 1 hours);
        QuoteEscrow escrow = new QuoteEscrow(deployer, address(registry));
        RiskGuard guard = new RiskGuard();
        NectarExecutor executor = new NectarExecutor(deployer, address(registry), address(escrow), address(guard));
        MorphoBlueAdapter adapter = new MorphoBlueAdapter(address(executor), address(morpho), deployer);
        escrow.setExecutor(address(executor));
        executor.setKeeperAllowlistEnabled(true);
        executor.setKeeper(keeper, true);
        executor.setKeeper(deployer, true);

        bytes32 morphoMarketId = morpho.createMarket(address(debt), address(collat), address(oracle), 0.8e18);
        bytes32 marketKey = keccak256(abi.encode(block.chainid, address(morpho), morphoMarketId));

        Types.Market memory m = Types.Market({
            marketKey: marketKey,
            chainId: block.chainid,
            protocol: address(morpho),
            morphoMarketId: morphoMarketId,
            adapter: address(adapter),
            adapterVersion: 1,
            debtToken: address(debt),
            collateralToken: address(collat),
            oracle: address(oracle),
            sequencer: address(sequencer),
            lltv: 0.8e18,
            admitted: true,
            mockLabeled: true
        });
        Types.Policy memory p = Types.Policy({
            version: 1,
            hash: bytes32(0),
            maxQuoteLifetime: 120,
            minPriceFreshness: 2 hours,
            sequencerGrace: 0,
            protocolFeeRecipient: deployer,
            ammEnabled: true
        });
        p.hash = QuoteLib.policyHash(p);
        registry.admitMarket(m, p);

        uint256 collateral = 20_000e18;
        uint256 debtAmt = 10_000e6;
        collat.mint(deployer, collateral);
        collat.approve(address(morpho), collateral);
        morpho.seedPosition(morphoMarketId, vm.envOr("BORROWER_ADDRESS", deployer), collateral, debtAmt);
        oracle.set(5e17, block.timestamp, false);

        debt.mint(deployer, 1_000_000e6);
        amm.setQuote(address(collat), collateral, address(debt), 9_820e6);
        debt.mint(address(amm), 50_000e6);

        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("debt", address(debt));
        console2.log("collateral", address(collat));
        console2.log("oracle", address(oracle));
        console2.log("sequencer", address(sequencer));
        console2.log("morpho", address(morpho));
        console2.log("amm", address(amm));
        console2.log("registry", address(registry));
        console2.log("escrow", address(escrow));
        console2.log("riskGuard", address(guard));
        console2.log("executor", address(executor));
        console2.log("adapter", address(adapter));
        console2.logBytes32(marketKey);
        console2.logBytes32(morphoMarketId);
        console2.logBytes32(p.hash);
    }
}
