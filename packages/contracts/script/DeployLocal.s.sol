// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MarketParams} from "../src/interfaces/IMorpho.sol";
import {ExternalSwapAdapter} from "../src/ExternalSwapAdapter.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {MockERC20, MockOracle, MockRouter} from "../src/mocks/Mocks.sol";
import {MorphoBlueAdapter} from "../src/MorphoBlueAdapter.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {NectarPropAMM} from "../src/NectarPropAMM.sol";
import {NectarPropAMMFactory} from "../src/NectarPropAMMFactory.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {NectarSandboxMorpho} from "../src/sandbox/NectarSandboxMorpho.sol";

/// @notice Local Anvil deploy. Chain id must be 31337.
///         The lending venue is Nectar Sandbox Morpho, not an official Morpho deployment.
contract DeployLocal is Script {
    uint256 internal constant LLTV = 0.8e18;
    uint256 internal constant REPAY = 10_000;
    uint256 internal constant COLLATERAL = 12_000;

    struct A {
        address debt;
        address coll;
        address oracle;
        address registry;
        address escrow;
        address executor;
        address adapter;
        address morpho;
        address factory;
        address pool;
        address risk;
        address swap;
        address router;
        address deployer;
        bytes32 marketId;
        bytes32 policyId;
    }

    A internal a;

    function run() external {
        require(block.chainid == 31337, "local chain only");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        a.deployer = vm.addr(pk);
        a.policyId = keccak256("robinhood.fresh-price-stock");
        vm.startBroadcast(pk);
        _tokens();
        _core();
        _routes();
        _seed();
        vm.stopBroadcast();
        _log();
    }

    function _tokens() internal {
        MockERC20 debt = new MockERC20("Nectar Rehearsal USD", "nUSD", 6);
        MockERC20 coll = new MockERC20("Nectar Rehearsal Collateral", "nSTK", 18);
        MockOracle oracle = new MockOracle();
        oracle.set(1e18, block.timestamp, 1e18, true, false);
        a.debt = address(debt);
        a.coll = address(coll);
        a.oracle = address(oracle);
    }

    function _core() internal {
        MarketRegistry registry = new MarketRegistry(a.deployer);
        QuoteEscrow escrow = new QuoteEscrow(address(registry));
        RiskGuard risk = new RiskGuard(address(0), 3600);
        NectarSandboxMorpho morpho = new NectarSandboxMorpho(a.deployer);
        NectarExecutor executor = new NectarExecutor(address(escrow), address(registry), a.deployer);
        MorphoBlueAdapter adapter = new MorphoBlueAdapter(address(morpho), address(executor));
        executor.setAdapter(address(adapter));
        escrow.setExecutor(address(executor));
        a.registry = address(registry);
        a.escrow = address(escrow);
        a.risk = address(risk);
        a.morpho = address(morpho);
        a.executor = address(executor);
        a.adapter = address(adapter);

        risk.setPolicy(
            a.policyId,
            RiskGuard.Policy({
                maxStaleness: 1 days,
                requireSessionOpen: true,
                rejectCorporateAction: true,
                feedScale: 1e18,
                exists: true
            })
        );
        risk.setPolicy(
            keccak256("robinhood.corporate-action-session"),
            RiskGuard.Policy({
                maxStaleness: 120,
                requireSessionOpen: true,
                rejectCorporateAction: true,
                feedScale: 1e18,
                exists: true
            })
        );
        a.marketId = registry.register(a.coll, a.debt, a.adapter, a.oracle, a.morpho, address(0), LLTV, 1, a.policyId);
    }

    function _routes() internal {
        address maker = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address updater = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;
        MockRouter router = new MockRouter();
        ExternalSwapAdapter swap = new ExternalSwapAdapter(a.adapter, address(router));
        NectarPropAMMFactory factory = new NectarPropAMMFactory(a.executor, a.adapter);
        address pool = factory.create(
            maker, a.debt, a.coll, a.risk, a.oracle, a.policyId, updater, 50, 0, 0, 0, 1_000_000
        );
        a.router = address(router);
        a.swap = address(swap);
        a.factory = address(factory);
        a.pool = pool;
    }

    function _seed() internal {
        address maker = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address quoteBorrower = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
        address propBorrower = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
        MockERC20 debt = MockERC20(a.debt);
        MockERC20 coll = MockERC20(a.coll);
        NectarSandboxMorpho morpho = NectarSandboxMorpho(a.morpho);
        MarketParams memory params = MarketParams({
            loanToken: a.debt,
            collateralToken: a.coll,
            oracle: a.oracle,
            irm: address(0),
            lltv: LLTV
        });
        morpho.enableIrm(address(0));
        morpho.enableLltv(LLTV);
        morpho.createMarket(params);
        debt.mint(a.deployer, 5_000_000);
        coll.mint(a.deployer, 100_000);
        debt.approve(a.morpho, type(uint256).max);
        coll.approve(a.morpho, type(uint256).max);
        morpho.supply(params, 1_000_000);
        morpho.openSandboxPosition(params, quoteBorrower, COLLATERAL, REPAY);
        morpho.openSandboxPosition(params, propBorrower, COLLATERAL, REPAY);
        debt.approve(a.escrow, type(uint256).max);
        QuoteEscrow(a.escrow).deposit(a.debt, 500_000, maker);
        debt.approve(a.pool, type(uint256).max);
        NectarPropAMM(a.pool).depositDebt(500_000);
        debt.mint(a.router, 500_000);
        MockRouter(a.router).setOut(12_000);
    }

    function _log() internal view {
        console2.log("ADDR quoteEscrow", a.escrow);
        console2.log("ADDR executor", a.executor);
        console2.log("ADDR marketRegistry", a.registry);
        console2.log("ADDR adapter", a.adapter);
        console2.log("ADDR sandboxMorpho", a.morpho);
        console2.log("ADDR propFactory", a.factory);
        console2.log("ADDR propPool", a.pool);
        console2.log("ADDR riskGuard", a.risk);
        console2.log("ADDR swapAdapter", a.swap);
        console2.log("ADDR router", a.router);
        console2.log("ADDR debtToken", a.debt);
        console2.log("ADDR collateralToken", a.coll);
        console2.log("ADDR oracle", a.oracle);
        console2.log("ADDR deployer", a.deployer);
        console2.log(string.concat("ADDR marketId ", vm.toString(a.marketId)));
        console2.log(string.concat("ADDR policyId ", vm.toString(a.policyId)));
        console2.log("ADDR startBlock", block.number);
    }
}
