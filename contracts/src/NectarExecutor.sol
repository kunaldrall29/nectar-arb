// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {MakerVault} from "./MakerVault.sol";
import {MiniMorpho} from "./lending/MiniMorpho.sol";
import {MarketParams, IMorphoLiquidateCallback} from "./lending/IMiniMorpho.sol";
import {IOracle} from "./interfaces/IOracle.sol";

/// @title NectarExecutor
/// @notice Validates a bounded liquidation job and settles it atomically against one funded maker quote
/// (PRD Section 9). In one transaction it:
///   1. checks keeper permission, pause scope, policy version, price validity and position eligibility
///   2. consumes the maker's reservation from the MakerVault
///   3. calls the admitted Morpho-style market's liquidation path; inside the authenticated callback it approves
///      exactly the repayment (bounded by maxDebtRepay)
///   4. delivers seized collateral to the maker's collateral recipient, pays the keeper fee, protocol fee and
///      residual surplus, asserts nothing is stranded, and emits LiquidationSettled
/// Any failure reverts everything. This contract also plays the role of the v1 Morpho adapter; it is the only
/// transient asset holder during a job.
contract NectarExecutor is IMorphoLiquidateCallback {
    using SafeERC20 for IERC20;
    using Math for uint256;

    bytes32 public constant ADAPTER_ID = keccak256("nectar.adapter.minimorpho.v1");

    enum Stage {
        Idle,
        AwaitingCallback,
        CallbackDone
    }

    enum Refusal {
        OK,
        KEEPER_NOT_ALLOWED,
        QUOTE_NOT_FUNDED,
        QUOTE_EXPIRED,
        JOB_EXPIRED,
        WRONG_POSITION,
        UNSUPPORTED_MARKET,
        SCOPE_PAUSED,
        POLICY_VERSION_MISMATCH,
        PRICE_UNAVAILABLE,
        POSITION_HEALTHY,
        POSITION_CHANGED,
        DEBT_EXCEEDS_BOUND,
        INSUFFICIENT_PROCEEDS
    }

    struct Job {
        bytes32 quoteId;
        address borrower;
        uint256 deadline;
    }

    struct Receipt {
        bytes32 jobId;
        bytes32 quoteId;
        bytes32 marketKey;
        address borrower;
        address maker;
        address keeper;
        uint256 debtRepaid;
        uint256 collateralDelivered;
        uint256 cashOut;
        uint256 keeperFee;
        uint256 protocolFee;
        uint256 surplus;
        uint256 writeoff;
        uint32 policyVersion;
    }

    MarketRegistry public immutable registry;
    MakerVault public immutable vault;

    Stage public stage;
    bytes32 internal _activeJob;
    address internal _activeLending;
    address internal _activeLoanToken;
    uint256 internal _activeMaxRepay;
    uint256 internal _observedRepay;

    uint256 public jobsSettled;
    uint256 public totalDebtRepaid;

    event LiquidationSettled(
        bytes32 indexed jobId,
        bytes32 indexed quoteId,
        bytes32 indexed marketKey,
        address borrower,
        address maker,
        address keeper,
        uint256 debtRepaid,
        uint256 collateralDelivered,
        uint256 cashOut,
        uint256 keeperFee,
        uint256 protocolFee,
        uint256 surplus,
        uint256 writeoff,
        uint32 policyVersion
    );

    error JobRefused(Refusal code);
    error Reentrancy();
    error UnexpectedCallback();
    error DebtExceedsBound(uint256 repaid, uint256 maxDebtRepay);
    error InsufficientProceeds(uint256 remainder, uint256 required);
    error BalanceMismatch();

    constructor(MarketRegistry registry_, MakerVault vault_) {
        registry = registry_;
        vault = vault_;
    }

    // -------------------------------------------------------------- execution

    function jobIdOf(Job calldata job) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), job.quoteId, job.borrower));
    }

    function executeJob(Job calldata job) external returns (Receipt memory r) {
        if (stage != Stage.Idle) revert Reentrancy();

        MakerVault.Quote memory q = vault.getQuote(job.quoteId);
        MarketRegistry.MarketConfig memory m = registry.getMarket(q.marketKey);
        {
            (Refusal code,,) = _preview(job, msg.sender, q, m);
            if (code != Refusal.OK && code != Refusal.DEBT_EXCEEDS_BOUND && code != Refusal.INSUFFICIENT_PROCEEDS) {
                revert JobRefused(code);
            }
        }

        MiniMorpho lending = MiniMorpho(m.lending);
        IERC20 debt = IERC20(m.params.loanToken);
        IERC20 coll = IERC20(m.params.collateralToken);
        uint256 debtBefore = debt.balanceOf(address(this));
        uint256 collBefore = coll.balanceOf(address(this));
        (, uint256 borrowBefore,) = lending.position(m.lendingMarketId, job.borrower);

        r.jobId = jobIdOf(job);
        _activeJob = r.jobId;
        _activeLending = address(lending);
        _activeLoanToken = address(debt);
        _activeMaxRepay = q.maxDebtRepay;
        stage = Stage.AwaitingCallback;

        vault.consume(job.quoteId);
        if (debt.balanceOf(address(this)) - debtBefore != q.cashOut) revert BalanceMismatch();

        (uint256 seized, uint256 repaid) =
            lending.liquidate(m.params, job.borrower, q.collateralAmount, abi.encode(r.jobId));

        if (stage != Stage.CallbackDone || repaid != _observedRepay) revert UnexpectedCallback();
        if (seized != q.collateralAmount || coll.balanceOf(address(this)) - collBefore != seized) {
            revert BalanceMismatch();
        }
        if (debt.balanceOf(address(this)) != debtBefore + q.cashOut - repaid) revert BalanceMismatch();

        uint256 remainder = q.cashOut - repaid;
        uint256 required = q.keeperFee + q.protocolFee + q.minNetSurplus;
        if (remainder < required) revert InsufficientProceeds(remainder, required);

        (, uint256 borrowAfter,) = lending.position(m.lendingMarketId, job.borrower);

        r.quoteId = job.quoteId;
        r.marketKey = q.marketKey;
        r.borrower = job.borrower;
        r.maker = q.maker;
        r.keeper = msg.sender;
        r.debtRepaid = repaid;
        r.collateralDelivered = seized;
        r.cashOut = q.cashOut;
        r.keeperFee = q.keeperFee;
        r.protocolFee = q.protocolFee;
        r.surplus = remainder - q.keeperFee - q.protocolFee;
        r.writeoff = borrowBefore - repaid - borrowAfter;
        r.policyVersion = q.policyVersion;

        coll.safeTransfer(q.collateralRecipient, seized);
        if (r.keeperFee > 0) debt.safeTransfer(msg.sender, r.keeperFee);
        if (r.protocolFee > 0) debt.safeTransfer(registry.treasury(), r.protocolFee);
        if (r.surplus > 0) debt.safeTransfer(q.surplusRecipient, r.surplus);

        if (debt.balanceOf(address(this)) != debtBefore || coll.balanceOf(address(this)) != collBefore) {
            revert BalanceMismatch();
        }

        jobsSettled += 1;
        totalDebtRepaid += repaid;
        _clear();

        emit LiquidationSettled(
            r.jobId,
            r.quoteId,
            r.marketKey,
            r.borrower,
            r.maker,
            r.keeper,
            r.debtRepaid,
            r.collateralDelivered,
            r.cashOut,
            r.keeperFee,
            r.protocolFee,
            r.surplus,
            r.writeoff,
            r.policyVersion
        );
    }

    /// @notice Authenticated settlement callback (PRD EX06 / settleExpectedCallback). Only the admitted lending
    /// market of the active job, only once, only during the expected stage.
    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external {
        if (stage != Stage.AwaitingCallback || msg.sender != _activeLending) revert UnexpectedCallback();
        if (abi.decode(data, (bytes32)) != _activeJob) revert UnexpectedCallback();
        if (repaidAssets > _activeMaxRepay) revert DebtExceedsBound(repaidAssets, _activeMaxRepay);
        stage = Stage.CallbackDone;
        _observedRepay = repaidAssets;
        IERC20(_activeLoanToken).forceApprove(msg.sender, repaidAssets);
    }

    function _clear() internal {
        stage = Stage.Idle;
        _activeJob = bytes32(0);
        _activeLending = address(0);
        _activeLoanToken = address(0);
        _activeMaxRepay = 0;
        _observedRepay = 0;
    }

    // ---------------------------------------------------------------- preview

    /// @notice Nonbinding structured preview with a refusal code (PRD previewJob). Keepers call this before
    /// simulating; the executor re-validates everything on execution.
    function previewJob(Job calldata job, address keeper)
        external
        view
        returns (Refusal code, uint256 expectedRepay, uint256 expectedSurplus)
    {
        MakerVault.Quote memory q = vault.getQuote(job.quoteId);
        MarketRegistry.MarketConfig memory m = registry.getMarket(q.marketKey);
        return _preview(job, keeper, q, m);
    }

    function _preview(Job calldata job, address keeper, MakerVault.Quote memory q, MarketRegistry.MarketConfig memory m)
        internal
        view
        returns (Refusal, uint256, uint256)
    {
        if (!registry.isKeeperAllowed(keeper)) return (Refusal.KEEPER_NOT_ALLOWED, 0, 0);
        if (vault.statusOf(job.quoteId) != MakerVault.Status.Active) return (Refusal.QUOTE_NOT_FUNDED, 0, 0);
        if (block.timestamp >= q.validUntil) return (Refusal.QUOTE_EXPIRED, 0, 0);
        if (block.timestamp > job.deadline) return (Refusal.JOB_EXPIRED, 0, 0);
        if (q.borrower != address(0) && q.borrower != job.borrower) return (Refusal.WRONG_POSITION, 0, 0);
        if (!m.admitted || m.adapterId != ADAPTER_ID) return (Refusal.UNSUPPORTED_MARKET, 0, 0);
        if (registry.isExecutionPaused(q.marketKey)) return (Refusal.SCOPE_PAUSED, 0, 0);
        if (m.policy.version != q.policyVersion) return (Refusal.POLICY_VERSION_MISMATCH, 0, 0);

        IOracle oracle = IOracle(m.params.oracle);
        uint256 px = oracle.price();
        uint256 ts = oracle.updatedAt();
        if (px == 0 || oracle.paused() || ts > block.timestamp || block.timestamp - ts > m.policy.maxPriceAge) {
            return (Refusal.PRICE_UNAVAILABLE, 0, 0);
        }

        MiniMorpho lending = MiniMorpho(m.lending);
        if (lending.isHealthy(m.params, job.borrower)) return (Refusal.POSITION_HEALTHY, 0, 0);
        (, uint256 borrowAssets, uint256 collateral) = lending.position(m.lendingMarketId, job.borrower);
        if (collateral < q.collateralAmount) return (Refusal.POSITION_CHANGED, 0, 0);

        uint256 repay = q.collateralAmount.mulDiv(px, 1e36, Math.Rounding.Ceil).mulDiv(
            1e18, lending.liquidationIncentiveFactor(m.params.lltv), Math.Rounding.Ceil
        );
        if (repay > borrowAssets) return (Refusal.POSITION_CHANGED, repay, 0);
        if (repay > q.maxDebtRepay) return (Refusal.DEBT_EXCEEDS_BOUND, repay, 0);
        uint256 required = q.keeperFee + q.protocolFee + q.minNetSurplus;
        if (q.cashOut - repay < required) return (Refusal.INSUFFICIENT_PROCEEDS, repay, 0);
        return (Refusal.OK, repay, q.cashOut - repay - q.keeperFee - q.protocolFee);
    }
}
