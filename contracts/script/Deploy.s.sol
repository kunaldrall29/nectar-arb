// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TestToken} from "../src/mocks/TestToken.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {DemoPositionFactory} from "../src/mocks/DemoPositionFactory.sol";
import {MiniMorpho} from "../src/lending/MiniMorpho.sol";
import {MarketParams} from "../src/lending/IMiniMorpho.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {MakerVault} from "../src/MakerVault.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";

/// @notice Deploys the full Nectar testnet slice, admits demo markets, seeds lending liquidity,
/// a self-operated demo maker balance and borrower positions that become liquidatable when the
/// (clearly labeled) mock oracle price is stressed.
///
///   forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    uint256 constant USDC = 1e6;
    uint256 constant SHARE = 1e18;
    uint256 constant DOLLAR = 1e24; // $1 per 1e18 collateral units in 6-dec loan units, scaled 1e36

    struct Deployed {
        TestToken usdc;
        TestToken tsla;
        TestToken aapl;
        TestToken nvda;
        MockOracle oTsla;
        MockOracle oAapl;
        MockOracle oNvda;
        MiniMorpho morpho;
        MarketRegistry registry;
        MakerVault vault;
        NectarExecutor executor;
        DemoPositionFactory factory;
        bytes32 kTsla;
        bytes32 kAapl;
        bytes32 kNvda;
        uint256 startBlock;
    }

    function run() external {
        address deployer = msg.sender;
        Deployed memory d;
        d.startBlock = block.number;

        vm.startBroadcast();

        d.usdc = new TestToken("Nectar Test USD Coin", "tUSDC", 6, 25_000 * USDC, deployer);
        d.tsla = new TestToken("Tesla Stock Token (test)", "tTSLA", 18, 20 * SHARE, deployer);
        d.aapl = new TestToken("Apple Stock Token (test)", "tAAPL", 18, 20 * SHARE, deployer);
        d.nvda = new TestToken("NVIDIA Stock Token (test)", "tNVDA", 18, 20 * SHARE, deployer);

        d.oTsla = new MockOracle("tTSLA / tUSDC (mock)", 250 * DOLLAR, true, deployer);
        d.oAapl = new MockOracle("tAAPL / tUSDC (mock)", 230 * DOLLAR, true, deployer);
        d.oNvda = new MockOracle("tNVDA / tUSDC (mock)", 180 * DOLLAR, true, deployer);

        d.morpho = new MiniMorpho();
        d.registry = new MarketRegistry(deployer, deployer, deployer, 300);
        d.vault = new MakerVault(d.registry, deployer);
        d.executor = new NectarExecutor(d.registry, d.vault);
        d.factory = new DemoPositionFactory(d.morpho);
        d.vault.setExecutor(address(d.executor));
        d.vault.setCashToken(address(d.usdc), true);

        MarketParams memory pTsla = MarketParams(address(d.usdc), address(d.tsla), address(d.oTsla), 0.77e18);
        MarketParams memory pAapl = MarketParams(address(d.usdc), address(d.aapl), address(d.oAapl), 0.86e18);
        MarketParams memory pNvda = MarketParams(address(d.usdc), address(d.nvda), address(d.oNvda), 0.77e18);
        d.morpho.createMarket(pTsla);
        d.morpho.createMarket(pAapl);
        d.morpho.createMarket(pNvda);

        MarketRegistry.Policy memory policy = MarketRegistry.Policy({
            version: 0,
            maxQuoteLifetime: 1800, // testnet deviation from the 120s production maximum, labeled in the app
            maxPriceAge: 7 days, // mock oracle heartbeat; production uses session-aware freshness
            minProtocolFeeBps: 10,
            maxQuoteCashOut: 1_000_000 * USDC
        });
        bytes32 adapter = d.executor.ADAPTER_ID();
        d.kTsla = d.registry.admitMarket(address(d.morpho), pTsla, adapter, "tTSLA / tUSDC", policy);
        d.kAapl = d.registry.admitMarket(address(d.morpho), pAapl, adapter, "tAAPL / tUSDC", policy);
        d.kNvda = d.registry.admitMarket(address(d.morpho), pNvda, adapter, "tNVDA / tUSDC", policy);

        // lending liquidity
        d.usdc.mint(deployer, 6_500_000 * USDC);
        d.usdc.approve(address(d.morpho), type(uint256).max);
        d.morpho.supply(pTsla, 2_000_000 * USDC, deployer);
        d.morpho.supply(pAapl, 2_000_000 * USDC, deployer);
        d.morpho.supply(pNvda, 2_000_000 * USDC, deployer);

        // self-operated demo maker cash (disclosed as team liquidity in the app)
        d.usdc.approve(address(d.vault), type(uint256).max);
        d.vault.deposit(address(d.usdc), 250_000 * USDC, deployer);

        // demo borrower positions
        d.tsla.mint(deployer, 1_000 * SHARE);
        d.aapl.mint(deployer, 1_000 * SHARE);
        d.nvda.mint(deployer, 1_000 * SHARE);
        d.tsla.approve(address(d.factory), type(uint256).max);
        d.aapl.approve(address(d.factory), type(uint256).max);
        d.nvda.approve(address(d.factory), type(uint256).max);
        d.factory.open(pTsla, 40 * SHARE, 7_000 * USDC); // liquidatable below ~$227.27
        d.factory.open(pTsla, 25 * SHARE, 4_500 * USDC); // below ~$233.77
        d.factory.open(pAapl, 60 * SHARE, 11_400 * USDC); // below ~$220.93
        d.factory.open(pNvda, 100 * SHARE, 12_000 * USDC); // below ~$155.84

        vm.stopBroadcast();

        _write(d, deployer);
    }

    function _write(Deployed memory d, address deployer) internal {
        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "startBlock", d.startBlock);
        vm.serializeAddress(o, "deployer", deployer);
        vm.serializeAddress(o, "usdc", address(d.usdc));
        vm.serializeAddress(o, "tsla", address(d.tsla));
        vm.serializeAddress(o, "aapl", address(d.aapl));
        vm.serializeAddress(o, "nvda", address(d.nvda));
        vm.serializeAddress(o, "oracleTsla", address(d.oTsla));
        vm.serializeAddress(o, "oracleAapl", address(d.oAapl));
        vm.serializeAddress(o, "oracleNvda", address(d.oNvda));
        vm.serializeAddress(o, "morpho", address(d.morpho));
        vm.serializeAddress(o, "registry", address(d.registry));
        vm.serializeAddress(o, "vault", address(d.vault));
        vm.serializeAddress(o, "executor", address(d.executor));
        vm.serializeAddress(o, "positionFactory", address(d.factory));
        vm.serializeBytes32(o, "marketTsla", d.kTsla);
        vm.serializeBytes32(o, "marketAapl", d.kAapl);
        string memory json = vm.serializeBytes32(o, "marketNvda", d.kNvda);
        string memory path = string.concat("../deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("deployment written to", path);
    }
}
