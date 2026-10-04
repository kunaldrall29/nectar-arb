// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle, MockSequencerUptimeFeed} from "../src/mocks/MockOracle.sol";
import {MockLendingMarket} from "../src/mocks/MockLendingMarket.sol";
import {MarketParams} from "../src/interfaces/IMorphoLike.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {MakerEscrow} from "../src/MakerEscrow.sol";
import {QuoteRegistry} from "../src/QuoteRegistry.sol";
import {PauseGuard} from "../src/PauseGuard.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {Quote, QuoteLib} from "../src/NectarTypes.sol";

abstract contract NectarBase is Test {
    uint256 constant USD = 1e6;
    uint256 constant SHARE = 1e18;

    address governance = makeAddr("governance");
    address guardian = makeAddr("guardian");
    address treasury = makeAddr("treasury");
    address lender = makeAddr("lender");
    address borrower = makeAddr("borrower");
    address keeper = makeAddr("keeper");
    address operator = makeAddr("operator");
    uint256 makerPk = 0xA11CE;
    address maker;
    uint256 maker2Pk = 0xB0B;
    address maker2;
    address makerInventory = makeAddr("makerInventory");

    MockERC20 usdg;
    MockERC20 tsla;
    MockOracle oracle;
    MockSequencerUptimeFeed seqFeed;
    MockLendingMarket lm;
    MarketParams params;
    MarketRegistry registry;
    MakerEscrow escrow;
    QuoteRegistry quotes;
    PauseGuard guard;
    NectarExecutor executor;
    bytes32 marketKey;
    bytes32 morphoId;
    uint256 quoteNonceCounter;

    function px(uint256 usdPerShare) internal pure returns (uint256) {
        return usdPerShare * 1e24;
    }

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        maker = vm.addr(makerPk);
        maker2 = vm.addr(maker2Pk);

        usdg = new MockERC20("Test USDG (mock)", "tUSDG", 6);
        tsla = new MockERC20("Mock Tesla Stock Token", "mTSLA", 18);
        oracle = new MockOracle("mTSLA / tUSDG mock price", px(400));
        seqFeed = new MockSequencerUptimeFeed();
        lm = new MockLendingMarket();
        params = MarketParams({loanToken: address(usdg), collateralToken: address(tsla), oracle: address(oracle), lltv: 0.5e18});
        morphoId = lm.createMarket(params);

        guard = new PauseGuard(guardian, governance);
        registry = new MarketRegistry(governance, 0);
        escrow = new MakerEscrow();
        quotes = new QuoteRegistry(escrow, registry, guard);
        escrow.bindRegistry(address(quotes));
        executor = new NectarExecutor(quotes, registry, guard, governance, treasury);
        quotes.bindExecutor(address(executor));

        vm.startPrank(governance);
        bytes32 sid = registry.schedulePolicy(_policy());
        registry.activatePolicy(sid);
        vm.stopPrank();
        marketKey = registry.computeMarketKey(address(lm), params);

        usdg.mint(lender, 1_000_000 * USD);
        vm.startPrank(lender);
        usdg.approve(address(lm), type(uint256).max);
        lm.supply(params, 1_000_000 * USD, lender);
        vm.stopPrank();

        tsla.mint(borrower, 60 * SHARE);
        vm.startPrank(borrower);
        tsla.approve(address(lm), type(uint256).max);
        lm.supplyCollateral(params, 60 * SHARE, borrower);
        lm.borrow(params, 10_000 * USD, borrower);
        vm.stopPrank();

        _deposit(maker, 20_000 * USD);
    }

    function _policy() internal view returns (MarketRegistry.Policy memory) {
        return MarketRegistry.Policy({
            lendingMarket: address(lm),
            params: params,
            priceSource: address(oracle),
            sequencerFeed: address(seqFeed),
            sequencerGracePeriod: 3600,
            maxPriceAge: 3600,
            maxQuoteLifetime: 120,
            adapterVersion: 1,
            debtDecimals: 6,
            collateralDecimals: 18
        });
    }

    function _deposit(address who, uint256 amount) internal {
        usdg.mint(who, amount);
        vm.startPrank(who);
        usdg.approve(address(escrow), amount);
        escrow.deposit(address(usdg), amount, who);
        vm.stopPrank();
    }

    function _makeUnhealthy() internal {
        oracle.setPrice(px(230));
    }

    /// @dev PRD section 9 numerical fixture: repay 10,000, cashOut 10,140, keeper 50, fee 20, surplus 70.
    function _fixtureQuote(address m) internal returns (Quote memory q) {
        q = Quote({
            schemaVersion: 1,
            maker: m,
            makerNonce: quotes.makerNonce(m),
            marketKey: marketKey,
            adapterVersion: 1,
            borrower: borrower,
            collateralToken: address(tsla),
            collateralAmount: 50 * SHARE,
            debtToken: address(usdg),
            cashOut: 10_140 * USD,
            maxDebtRepay: 10_000 * USD,
            collateralRecipient: makerInventory,
            keeperCompensation: 50 * USD,
            protocolFee: 20 * USD,
            minNetSurplus: 70 * USD,
            keeperRecipient: address(0),
            surplusRecipient: operator,
            validUntil: uint64(block.timestamp + 30),
            policyHash: registry.getMarket(marketKey).policyHash,
            quoteNonce: ++quoteNonceCounter
        });
    }

    function _sign(Quote memory q, uint256 pk) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", quotes.domainSeparator(), QuoteLib.hashStruct(q)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _register(Quote memory q) internal returns (bytes32) {
        return quotes.registerQuote(q, _sign(q, makerPk));
    }
}
