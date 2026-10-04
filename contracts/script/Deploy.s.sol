// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle, MockSequencerUptimeFeed} from "../src/mocks/MockOracle.sol";
import {MockLendingMarket} from "../src/mocks/MockLendingMarket.sol";
import {MarketParams} from "../src/interfaces/IMorphoLike.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {MakerEscrow} from "../src/MakerEscrow.sol";
import {QuoteRegistry} from "../src/QuoteRegistry.sol";
import {PauseGuard} from "../src/PauseGuard.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";

/// @notice Deploys the Nectar testnet slice (core contracts + clearly labeled mocks) and writes
///         deployments/<chainId>.json. Env: PRIVATE_KEY, optional GIT_COMMIT, NETWORK_NAME, TIMELOCK_DELAY.
contract Deploy is Script {
    struct Core {
        MockERC20 debt;
        MockERC20 tsla;
        MockERC20 nvda;
        MockOracle tslaOracle;
        MockOracle nvdaOracle;
        MockSequencerUptimeFeed seqFeed;
        MockLendingMarket lm;
        PauseGuard guard;
        MarketRegistry registry;
        MakerEscrow escrow;
        QuoteRegistry quotes;
        NectarExecutor executor;
        bytes32 tslaMarket;
        bytes32 nvdaMarket;
    }

    uint256 constant LLTV = 0.5e18;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        uint64 delay = uint64(vm.envOr("TIMELOCK_DELAY", uint256(0)));
        bool isRobinhood = block.chainid == 46630 || block.chainid == 4663;
        string memory debtSymbol = isRobinhood ? "tUSDG" : (block.chainid == 421614 ? "tUSDC" : "tUSDG");
        string memory debtName = isRobinhood ? "Test USDG (Nectar mock)" : (block.chainid == 421614 ? "Test USDC (Nectar mock)" : "Test USDG (Nectar mock)");
        uint256 startBlock = block.number;

        vm.startBroadcast(pk);
        Core memory c;
        c.debt = new MockERC20(debtName, debtSymbol, 6);
        c.tsla = new MockERC20("Mock Tesla Stock Token", "mTSLA", 18);
        c.nvda = new MockERC20("Mock NVIDIA Stock Token", "mNVDA", 18);
        c.tslaOracle = new MockOracle("mTSLA / debt mock price", 250e24);
        c.nvdaOracle = new MockOracle("mNVDA / debt mock price", 180e24);
        c.seqFeed = new MockSequencerUptimeFeed();
        c.lm = new MockLendingMarket();

        c.guard = new PauseGuard(deployer, deployer);
        c.registry = new MarketRegistry(deployer, delay);
        c.escrow = new MakerEscrow();
        c.quotes = new QuoteRegistry(c.escrow, c.registry, c.guard);
        c.escrow.bindRegistry(address(c.quotes));
        c.executor = new NectarExecutor(c.quotes, c.registry, c.guard, deployer, deployer);
        c.quotes.bindExecutor(address(c.executor));

        c.tslaMarket = _admit(c, c.tsla, c.tslaOracle, delay);
        c.nvdaMarket = _admit(c, c.nvda, c.nvdaOracle, delay);

        c.debt.mint(deployer, 4_000_000e6);
        c.debt.approve(address(c.lm), type(uint256).max);
        c.lm.supply(_params(c, c.tsla, c.tslaOracle), 2_000_000e6, deployer);
        c.lm.supply(_params(c, c.nvda, c.nvdaOracle), 2_000_000e6, deployer);
        vm.stopBroadcast();

        _writeManifest(c, deployer, startBlock, delay);
    }

    function _params(Core memory c, MockERC20 coll, MockOracle o) internal pure returns (MarketParams memory) {
        return MarketParams({loanToken: address(c.debt), collateralToken: address(coll), oracle: address(o), lltv: LLTV});
    }

    function _admit(Core memory c, MockERC20 coll, MockOracle o, uint64 delay) internal returns (bytes32) {
        MarketParams memory p = _params(c, coll, o);
        c.lm.createMarket(p);
        bytes32 sid = c.registry.schedulePolicy(
            MarketRegistry.Policy({
                lendingMarket: address(c.lm),
                params: p,
                priceSource: address(o),
                sequencerFeed: address(c.seqFeed),
                sequencerGracePeriod: 600,
                maxPriceAge: 3600,
                maxQuoteLifetime: 120,
                adapterVersion: 1,
                debtDecimals: 6,
                collateralDecimals: 18
            })
        );
        if (delay == 0) c.registry.activatePolicy(sid);
        return c.registry.computeMarketKey(address(c.lm), p);
    }

    function _writeManifest(Core memory c, address deployer, uint256 startBlock, uint64 delay) internal {
        string memory o = "contracts";
        vm.serializeAddress(o, "MakerEscrow", address(c.escrow));
        vm.serializeAddress(o, "QuoteRegistry", address(c.quotes));
        vm.serializeAddress(o, "NectarExecutor", address(c.executor));
        vm.serializeAddress(o, "MarketRegistry", address(c.registry));
        vm.serializeAddress(o, "PauseGuard", address(c.guard));
        vm.serializeAddress(o, "MockLendingMarket", address(c.lm));
        vm.serializeAddress(o, "MockSequencerUptimeFeed", address(c.seqFeed));
        vm.serializeAddress(o, "DebtToken", address(c.debt));
        vm.serializeAddress(o, "mTSLA", address(c.tsla));
        vm.serializeAddress(o, "mNVDA", address(c.nvda));
        vm.serializeAddress(o, "mTSLAOracle", address(c.tslaOracle));
        string memory contractsJson = vm.serializeAddress(o, "mNVDAOracle", address(c.nvdaOracle));

        string memory h = "codehashes";
        vm.serializeBytes32(h, "MakerEscrow", address(c.escrow).codehash);
        vm.serializeBytes32(h, "QuoteRegistry", address(c.quotes).codehash);
        vm.serializeBytes32(h, "NectarExecutor", address(c.executor).codehash);
        vm.serializeBytes32(h, "MarketRegistry", address(c.registry).codehash);
        string memory hashesJson = vm.serializeBytes32(h, "PauseGuard", address(c.guard).codehash);

        string memory m = "markets";
        vm.serializeBytes32(m, "mTSLA", c.tslaMarket);
        string memory marketsJson = vm.serializeBytes32(m, "mNVDA", c.nvdaMarket);

        string memory r = "root";
        vm.serializeString(r, "schema", "nectar.deployment/v1");
        vm.serializeString(r, "network", vm.envOr("NETWORK_NAME", string("local")));
        vm.serializeUint(r, "chainId", block.chainid);
        vm.serializeString(r, "scope", "HACKATHON/TESTNET SLICE: mock lending market, mock oracle, mock tokens");
        vm.serializeAddress(r, "deployer", deployer);
        vm.serializeAddress(r, "governance", deployer);
        vm.serializeAddress(r, "guardian", deployer);
        vm.serializeAddress(r, "feeRecipient", deployer);
        vm.serializeUint(r, "timelockDelaySeconds", delay);
        vm.serializeBool(r, "keeperAllowlistEnabled", false);
        vm.serializeUint(r, "deploymentBlock", startBlock);
        vm.serializeUint(r, "deployedAt", block.timestamp);
        vm.serializeString(r, "releaseCommit", vm.envOr("GIT_COMMIT", string("unknown")));
        vm.serializeString(r, "compiler", "solc 0.8.24, optimizer 200 runs, via_ir, evm cancun");
        vm.serializeString(r, "dependencies", "openzeppelin-contracts v5.1.0, forge-std v1.9.4");
        vm.serializeString(r, "adapterVersion", "morpho-like-mock/1");
        vm.serializeString(r, "contracts", contractsJson);
        vm.serializeString(r, "codehashes", hashesJson);
        string memory json = vm.serializeString(r, "markets", marketsJson);

        string memory path = string.concat(vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("manifest written", path);
    }
}
