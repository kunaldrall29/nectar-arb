// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    AlreadySet,
    BadMarket,
    BadParameter,
    CollateralMismatch,
    Dust,
    Expired,
    InsufficientProceeds,
    MaxDebtExceeded,
    Mismatch,
    ScopePaused,
    Unauthorized,
    ZeroAddress
} from "./Errors.sol";
import {INectarExecutor} from "./interfaces/INectar.sol";
import {MarketParams} from "./interfaces/IMorpho.sol";
import {RouteLib} from "./libraries/RouteLib.sol";
import {QuoteTypes} from "./libraries/QuoteTypes.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {MorphoBlueAdapter} from "./MorphoBlueAdapter.sol";
import {QuoteEscrow} from "./QuoteEscrow.sol";

/// @notice One bounded liquidation job. Guardian pause is checked here and cannot redirect recipients.
///         The protocol fee recipient is immutable.
contract NectarExecutor is ReentrancyGuard, INectarExecutor {
    using SafeERC20 for IERC20;

    enum RouteId {
        None,
        Quote,
        PropAMM,
        External
    }

    struct Job {
        bytes32 marketId;
        address borrower;
        uint256 repayAssets;
        RouteId route;
        uint256 reservationId;
        address pool;
        address swapAdapter;
        uint256 minSaleOut;
        address keeperRecipient;
        uint256 keeperCompensation;
        uint256 protocolFee;
        address surplusRecipient;
        uint64 deadline;
    }

    QuoteEscrow public immutable escrow;
    MarketRegistry public immutable registry;
    MorphoBlueAdapter public adapter;
    address public immutable protocolFeeRecipient;

    JobView private _active;

    event LiquidationSettled(
        bytes32 indexed marketId,
        address indexed borrower,
        uint8 route,
        uint256 debtRepaid,
        uint256 collateralAmount,
        uint256 keeperCompensation,
        uint256 protocolFee,
        uint256 surplus,
        address collateralRecipient,
        address keeper
    );

    constructor(address escrow_, address registry_, address protocolFeeRecipient_) {
        if (escrow_ == address(0) || registry_ == address(0) || protocolFeeRecipient_ == address(0)) revert ZeroAddress();
        escrow = QuoteEscrow(escrow_);
        registry = MarketRegistry(registry_);
        protocolFeeRecipient = protocolFeeRecipient_;
    }

    function setAdapter(address adapter_) external {
        if (address(adapter) != address(0)) revert AlreadySet();
        if (msg.sender != registry.owner()) revert Unauthorized();
        if (adapter_ == address(0)) revert ZeroAddress();
        adapter = MorphoBlueAdapter(adapter_);
    }

    function jobActive() external view returns (bool) {
        return _active.live;
    }

    function activeJob() external view returns (JobView memory) {
        return _active;
    }

    function selectRoute(
        uint256 required,
        uint256 quoteCashOut,
        bool quoteLive,
        uint256 propOut,
        bool propLive,
        uint256 externalOut,
        bool externalLive
    ) external pure returns (uint8 route, uint256 best) {
        return RouteLib.select(
            required,
            RouteLib.Offer({debtOut: quoteCashOut, live: quoteLive}),
            RouteLib.Offer({debtOut: propOut, live: propLive}),
            RouteLib.Offer({debtOut: externalOut, live: externalLive})
        );
    }

    function execute(Job calldata job) external nonReentrant {
        if (job.deadline < block.timestamp) revert Expired();
        if (job.repayAssets == 0 || job.route == RouteId.None) revert BadParameter();
        if (job.keeperRecipient == address(0) || job.surplusRecipient == address(0)) revert ZeroAddress();
        if (registry.executionPaused()) revert ScopePaused();

        MarketRegistry.Market memory m = registry.getMarket(job.marketId);
        if (!m.exists || m.paused) revert ScopePaused();
        if (m.adapter != address(adapter) || m.morpho != adapter.morpho()) revert BadMarket();
        if (job.keeperRecipient == address(this) || job.surplusRecipient == address(this)) revert ZeroAddress();

        uint256 cashOut;
        uint256 expectedCollateral;
        address collateralRecipient;
        if (job.route == RouteId.Quote) {
            (cashOut, expectedCollateral, collateralRecipient) = _takeQuote(job, m);
        } else if (job.route == RouteId.PropAMM) {
            if (job.pool == address(0)) revert ZeroAddress();
            collateralRecipient = job.pool;
        } else if (job.route == RouteId.External) {
            if (job.swapAdapter == address(0)) revert ZeroAddress();
            collateralRecipient = job.swapAdapter;
        } else {
            revert BadParameter();
        }
        if (collateralRecipient == address(this) || collateralRecipient == address(adapter)) revert ZeroAddress();

        _active = JobView({
            live: true,
            route: uint8(job.route),
            pool: job.pool,
            swapAdapter: job.swapAdapter,
            minSaleOut: job.minSaleOut
        });
        bytes memory data = abi.encode(_active.route, _active.pool, _active.swapAdapter, _active.minSaleOut);
        (uint256 seized, uint256 repaid) = adapter.liquidate(_params(m), job.borrower, 0, job.repayAssets, data);
        _active.live = false;

        if (repaid != job.repayAssets) revert Mismatch();
        if (job.route == RouteId.Quote && seized != expectedCollateral) revert CollateralMismatch();
        uint256 surplus = _pay(job, m, cashOut, repaid, seized, collateralRecipient);
        emit LiquidationSettled(
            job.marketId,
            job.borrower,
            uint8(job.route),
            repaid,
            seized,
            job.keeperCompensation,
            job.protocolFee,
            surplus,
            collateralRecipient,
            msg.sender
        );
    }

    function _takeQuote(Job calldata job, MarketRegistry.Market memory m)
        internal
        returns (uint256 cashOut, uint256 collateralAmount, address collateralRecipient)
    {
        (QuoteTypes.Quote memory q, uint8 st) = escrow.getQuote(job.reservationId);
        if (st != uint8(QuoteEscrow.Status.Active)) revert BadParameter();
        if (q.marketKey != job.marketId || q.borrower != job.borrower) revert Mismatch();
        if (q.debtToken != m.debtToken || q.collateralToken != m.collateralToken) revert Mismatch();
        if (q.keeperRecipient != job.keeperRecipient || q.surplusRecipient != job.surplusRecipient) revert Mismatch();
        if (q.keeperCompensation != job.keeperCompensation || q.protocolFee != job.protocolFee) revert Mismatch();
        if (q.maxDebtRepay < job.repayAssets) revert MaxDebtExceeded();
        if (!RouteLib.allocationWorks(q.cashOut, job.repayAssets, q.keeperCompensation, q.protocolFee, q.minNetSurplus)) {
            revert InsufficientProceeds();
        }
        escrow.consume(job.reservationId);
        IERC20(m.debtToken).safeTransfer(address(adapter), q.cashOut);
        return (q.cashOut, q.collateralAmount, q.collateralRecipient);
    }

    function _pay(
        Job calldata job,
        MarketRegistry.Market memory m,
        uint256 cashOut,
        uint256 repaid,
        uint256 seized,
        address collateralRecipient
    ) internal returns (uint256 surplus) {
        IERC20 debt = IERC20(m.debtToken);
        IERC20 coll = IERC20(m.collateralToken);
        if (job.route == RouteId.Quote) {
            if (coll.balanceOf(address(this)) != seized) revert CollateralMismatch();
            uint256 fees = job.keeperCompensation + job.protocolFee;
            if (cashOut < fees + repaid) revert InsufficientProceeds();
            surplus = cashOut - fees - repaid;
            coll.safeTransfer(collateralRecipient, seized);
        } else {
            uint256 bal = debt.balanceOf(address(this));
            uint256 fees = job.keeperCompensation + job.protocolFee;
            if (bal < fees) revert InsufficientProceeds();
            surplus = bal - fees;
            if (job.minSaleOut != 0 && repaid + bal < job.minSaleOut) revert InsufficientProceeds();
        }
        if (job.keeperCompensation != 0) debt.safeTransfer(job.keeperRecipient, job.keeperCompensation);
        if (job.protocolFee != 0) debt.safeTransfer(protocolFeeRecipient, job.protocolFee);
        if (surplus != 0) debt.safeTransfer(job.surplusRecipient, surplus);
        if (debt.balanceOf(address(this)) != 0 || coll.balanceOf(address(this)) != 0) revert Dust();
    }

    function _params(MarketRegistry.Market memory m) internal pure returns (MarketParams memory) {
        return MarketParams({
            loanToken: m.debtToken,
            collateralToken: m.collateralToken,
            oracle: m.oracle,
            irm: m.irm,
            lltv: m.lltv
        });
    }
}
