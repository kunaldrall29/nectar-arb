// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketParams} from "../src/interfaces/IMorpho.sol";
import {ExternalSwapAdapter} from "../src/ExternalSwapAdapter.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {MockERC20, MockOracle, MockRouter} from "../src/mocks/Mocks.sol";
import {MorphoBlueAdapter} from "../src/MorphoBlueAdapter.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {NectarPropAMM} from "../src/NectarPropAMM.sol";
import {NectarPropAMMFactory} from "../src/NectarPropAMMFactory.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {QuoteTypes} from "../src/libraries/QuoteTypes.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {NectarSandboxMorpho} from "../src/sandbox/NectarSandboxMorpho.sol";

abstract contract ProtocolBase is Test {
    uint256 internal constant LLTV = 0.8e18;
    uint256 internal constant REPAY = 10_000;
    uint256 internal constant POS_COLLATERAL = 12_000;
    uint256 internal constant CASH_OUT = 10_140;
    uint256 internal constant KEEPER_FEE = 50;
    uint256 internal constant PROTOCOL_FEE = 20;
    uint256 internal constant MIN_SURPLUS = 70;

    MockERC20 internal debt;
    MockERC20 internal coll;
    MockOracle internal oracle;
    MarketRegistry internal registry;
    QuoteEscrow internal escrow;
    RiskGuard internal risk;
    NectarSandboxMorpho internal morpho;
    NectarExecutor internal executor;
    MorphoBlueAdapter internal adapter;
    MockRouter internal router;
    ExternalSwapAdapter internal swap;
    NectarPropAMMFactory internal factory;
    NectarPropAMM internal pool;

    uint256 internal makerPk;
    address internal maker;
    address internal keeper;
    address internal borrower;
    address internal feeSink;
    address internal surplusTo;
    address internal guardian;
    address internal updater;
    bytes32 internal policyId;
    bytes32 internal marketId;
    MarketParams internal params;
    uint256 internal seized;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        makerPk = 0xA11CE;
        maker = vm.addr(makerPk);
        keeper = makeAddr("keeper");
        borrower = makeAddr("borrower");
        feeSink = makeAddr("fee");
        surplusTo = makeAddr("surplus");
        guardian = makeAddr("guardian");
        updater = makeAddr("updater");
        policyId = keccak256("robinhood.fresh-price-stock");

        debt = new MockERC20("Nectar Rehearsal USD", "nUSD", 6);
        coll = new MockERC20("Nectar Rehearsal Collateral", "nSTK", 18);
        oracle = new MockOracle();
        oracle.set(1e18, block.timestamp, 1e18, true, false);

        registry = new MarketRegistry(guardian);
        escrow = new QuoteEscrow(address(registry));
        risk = new RiskGuard(address(0), 3600);
        morpho = new NectarSandboxMorpho(address(this));
        executor = new NectarExecutor(address(escrow), address(registry), feeSink);
        adapter = new MorphoBlueAdapter(address(morpho), address(executor));
        executor.setAdapter(address(adapter));
        escrow.setExecutor(address(executor));
        router = new MockRouter();
        swap = new ExternalSwapAdapter(address(adapter), address(router));
        factory = new NectarPropAMMFactory(address(executor), address(adapter));
        pool = NectarPropAMM(
            factory.create(
                maker,
                address(debt),
                address(coll),
                address(risk),
                address(oracle),
                policyId,
                updater,
                50,
                0,
                0,
                0,
                1_000_000
            )
        );

        risk.setPolicy(
            policyId,
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

        marketId = registry.register(
            address(coll), address(debt), address(adapter), address(oracle), address(morpho), address(0), LLTV, 1, policyId
        );
        params = MarketParams({
            loanToken: address(debt),
            collateralToken: address(coll),
            oracle: address(oracle),
            irm: address(0),
            lltv: LLTV
        });
        morpho.enableIrm(address(0));
        morpho.enableLltv(LLTV);
        morpho.createMarket(params);

        debt.mint(address(this), 2_000_000);
        coll.mint(address(this), 2_000_000);
        debt.approve(address(morpho), type(uint256).max);
        coll.approve(address(morpho), type(uint256).max);
        morpho.supply(params, 1_000_000);
        morpho.openSandboxPosition(params, borrower, POS_COLLATERAL, REPAY);
        (seized,,) = morpho.previewLiquidate(params, borrower, REPAY);

        debt.approve(address(escrow), type(uint256).max);
        escrow.deposit(address(debt), 200_000, maker);
        debt.approve(address(pool), type(uint256).max);
        pool.depositDebt(200_000);
        debt.mint(address(router), 200_000);
    }

    function _quote(address maker_, uint256 nonce, uint256 cashOut, uint256 collateralAmount)
        internal
        view
        returns (QuoteTypes.Quote memory q)
    {
        q.schemaVersion = 1;
        q.maker = maker_;
        q.makerNonce = nonce;
        q.marketKey = marketId;
        q.adapterVersion = 1;
        q.borrower = borrower;
        q.collateralToken = address(coll);
        q.collateralAmount = collateralAmount;
        q.debtToken = address(debt);
        q.cashOut = cashOut;
        q.maxDebtRepay = REPAY;
        q.collateralRecipient = maker_;
        q.keeperCompensation = KEEPER_FEE;
        q.protocolFee = PROTOCOL_FEE;
        q.minNetSurplus = MIN_SURPLUS;
        q.keeperRecipient = keeper;
        q.surplusRecipient = surplusTo;
        q.validUntil = uint64(block.timestamp + escrow.DEFAULT_LIFETIME());
        q.reservationId = nonce;
        q.policyHash = policyId;
        q.quoteNonce = nonce;
    }

    function _sign(uint256 pk, QuoteTypes.Quote memory q) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, escrow.hashTypedData(q));
        return abi.encodePacked(r, s, v);
    }

    function _job(NectarExecutor.RouteId route, uint256 reservationId, uint256 minSale)
        internal
        view
        returns (NectarExecutor.Job memory j)
    {
        j.marketId = marketId;
        j.borrower = borrower;
        j.repayAssets = REPAY;
        j.route = route;
        j.reservationId = reservationId;
        j.pool = address(pool);
        j.swapAdapter = address(swap);
        j.minSaleOut = minSale;
        j.keeperRecipient = keeper;
        j.keeperCompensation = KEEPER_FEE;
        j.protocolFee = PROTOCOL_FEE;
        j.surplusRecipient = surplusTo;
        j.deadline = uint64(block.timestamp + 60);
    }
}
