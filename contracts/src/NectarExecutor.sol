// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    MarketParams,
    IMorphoLike,
    IMorphoLiquidateCallback,
    INectarPriceSource,
    ISequencerUptimeFeed
} from "./interfaces/IMorphoLike.sol";
import {Quote, QuoteStatus, Scopes} from "./NectarTypes.sol";
import {QuoteRegistry} from "./QuoteRegistry.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {PauseGuard} from "./PauseGuard.sol";

/// @title NectarExecutor
/// @notice Atomic liquidation against an admitted Morpho-like market that consumes one funded maker quote.
///         Debt is repaid, collateral delivered to the maker's recipient, keeper compensation and protocol fee paid,
///         residual surplus sent to the signed surplus recipient - or the whole transaction reverts (EX04).
contract NectarExecutor is IMorphoLiquidateCallback {
    using SafeERC20 for IERC20;

    enum Refusal {
        NONE,
        SCOPE_PAUSED,
        KEEPER_NOT_ALLOWED,
        JOB_EXPIRED,
        QUOTE_NOT_FUNDED,
        QUOTE_EXPIRED,
        UNSUPPORTED_MARKET,
        POLICY_CHANGED,
        PRICE_UNAVAILABLE,
        SEQUENCER_UNAVAILABLE,
        POSITION_CHANGED,
        DEBT_ABOVE_BOUND,
        INSUFFICIENT_PROCEEDS
    }

    enum Stage {
        Idle,
        AwaitingCallback,
        CallbackDone
    }

    struct Preview {
        Refusal reason;
        uint256 repaidAssets;
        uint256 collateralAmount;
        uint256 keeperCompensation;
        uint256 protocolFee;
        uint256 surplus;
        uint256 borrowerDebt;
    }

    struct Settlement {
        address borrower;
        address maker;
        address keeper;
        address collateralRecipient;
        address keeperRecipient;
        address surplusRecipient;
        address debtToken;
        address collateralToken;
        uint256 cashOut;
        uint256 repaidAssets;
        uint256 collateralAmount;
        uint256 keeperCompensation;
        uint256 protocolFee;
        uint256 surplus;
        uint256 writeoff;
        uint32 adapterVersion;
        uint32 policyVersion;
    }

    uint32 public constant ADAPTER_VERSION = 1;

    QuoteRegistry public immutable quotes;
    MarketRegistry public immutable markets;
    PauseGuard public immutable guard;
    address public immutable governance;
    address public immutable feeRecipient;

    bool public keeperAllowlistEnabled;
    mapping(address => bool) public keeperAllowed;

    Stage public stage;
    bytes32 internal _activeJobId;
    address internal _activeLendingMarket;
    uint256 internal _activeMaxRepay;
    address internal _activeDebtToken;
    uint256 internal _callbackRepaid;

    event LiquidationSettled(
        bytes32 indexed jobId, bytes32 indexed quoteId, bytes32 indexed marketKey, Settlement settlement
    );
    event KeeperAllowlistSet(bool enabled);
    event KeeperSet(address indexed keeper, bool allowed);

    error Refused(Refusal reason);
    error NotGovernance();
    error JobInProgress();
    error UnexpectedCallback();
    error BalanceMismatch(string what);

    constructor(
        QuoteRegistry quotes_,
        MarketRegistry markets_,
        PauseGuard guard_,
        address governance_,
        address feeRecipient_
    ) {
        quotes = quotes_;
        markets = markets_;
        guard = guard_;
        governance = governance_;
        feeRecipient = feeRecipient_;
    }

    function setKeeperAllowlist(bool enabled) external {
        if (msg.sender != governance) revert NotGovernance();
        keeperAllowlistEnabled = enabled;
        emit KeeperAllowlistSet(enabled);
    }

    function setKeeper(address keeper, bool allowed) external {
        if (msg.sender != governance) revert NotGovernance();
        keeperAllowed[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function jobIdFor(bytes32 quoteId) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), quoteId));
    }

    /// @notice Nonbinding structured preview with the refusal reason the executor would apply now.
    function previewJob(bytes32 quoteId, uint64 deadline, address keeper) public view returns (Preview memory p) {
        (Quote memory q, QuoteStatus status) = quotes.getQuote(quoteId);
        p.collateralAmount = q.collateralAmount;
        p.keeperCompensation = q.keeperCompensation;
        p.protocolFee = q.protocolFee;
        if (keeperAllowlistEnabled && !keeperAllowed[keeper]) return _refuse(p, Refusal.KEEPER_NOT_ALLOWED);
        if (block.timestamp > deadline) return _refuse(p, Refusal.JOB_EXPIRED);
        if (status != QuoteStatus.Active) return _refuse(p, Refusal.QUOTE_NOT_FUNDED);
        if (block.timestamp >= q.validUntil) return _refuse(p, Refusal.QUOTE_EXPIRED);
        if (guard.isPaused(Scopes.GLOBAL_EXECUTION, Scopes.marketExecution(q.marketKey))) {
            return _refuse(p, Refusal.SCOPE_PAUSED);
        }

        MarketRegistry.MarketState memory m = markets.getMarket(q.marketKey);
        if (!m.admitted) return _refuse(p, Refusal.UNSUPPORTED_MARKET);
        if (m.policyHash != q.policyHash || m.policy.adapterVersion != q.adapterVersion || q.adapterVersion != ADAPTER_VERSION) {
            return _refuse(p, Refusal.POLICY_CHANGED);
        }
        if (!_priceValid(m.policy)) return _refuse(p, Refusal.PRICE_UNAVAILABLE);
        if (!_sequencerUp(m.policy)) return _refuse(p, Refusal.SEQUENCER_UNAVAILABLE);

        IMorphoLike lm = IMorphoLike(m.policy.lendingMarket);
        (uint256 collateral, uint256 debt) = lm.position(keccak256(abi.encode(m.policy.params)), q.borrower);
        p.borrowerDebt = debt;
        if (debt == 0 || collateral < q.collateralAmount || lm.isHealthy(m.policy.params, q.borrower)) {
            return _refuse(p, Refusal.POSITION_CHANGED);
        }
        p.repaidAssets = lm.previewLiquidation(m.policy.params, q.collateralAmount);
        if (p.repaidAssets > q.maxDebtRepay) return _refuse(p, Refusal.DEBT_ABOVE_BOUND);
        uint256 obligations = p.repaidAssets + q.keeperCompensation + q.protocolFee;
        if (obligations > q.cashOut || q.cashOut - obligations < q.minNetSurplus) {
            return _refuse(p, Refusal.INSUFFICIENT_PROCEEDS);
        }
        p.surplus = q.cashOut - obligations;
    }

    /// @notice Executes one bounded job: the only free inputs are the quote identity and a deadline (EX01).
    function executeJob(bytes32 quoteId, uint64 deadline) external returns (bytes32 jobId) {
        if (stage != Stage.Idle) revert JobInProgress();
        Preview memory p = previewJob(quoteId, deadline, msg.sender);
        if (p.reason != Refusal.NONE) revert Refused(p.reason);

        (Quote memory pre,) = quotes.getQuote(quoteId);
        uint256 debtBal0 = IERC20(pre.debtToken).balanceOf(address(this));
        uint256 collBal0 = IERC20(pre.collateralToken).balanceOf(address(this));

        Quote memory q = quotes.consumeForExecution(quoteId);
        MarketRegistry.MarketState memory m = markets.getMarket(q.marketKey);
        IMorphoLike lm = IMorphoLike(m.policy.lendingMarket);
        bytes32 morphoId = keccak256(abi.encode(m.policy.params));
        jobId = jobIdFor(quoteId);

        IERC20 debtToken = IERC20(q.debtToken);
        IERC20 collToken = IERC20(q.collateralToken);
        (, uint256 debtBefore) = lm.position(morphoId, q.borrower);

        stage = Stage.AwaitingCallback;
        _activeJobId = jobId;
        _activeLendingMarket = address(lm);
        _activeMaxRepay = q.maxDebtRepay;
        _activeDebtToken = q.debtToken;

        (uint256 seized, uint256 repaid) = lm.liquidate(m.policy.params, q.borrower, q.collateralAmount, 0, abi.encode(jobId));

        if (stage != Stage.CallbackDone || repaid != _callbackRepaid) revert UnexpectedCallback();
        stage = Stage.Idle;
        _activeJobId = bytes32(0);
        _activeLendingMarket = address(0);
        _callbackRepaid = 0;
        debtToken.forceApprove(address(lm), 0);

        if (seized != q.collateralAmount || collToken.balanceOf(address(this)) - collBal0 != q.collateralAmount) {
            revert BalanceMismatch("collateral");
        }
        if (debtToken.balanceOf(address(this)) + repaid != debtBal0 + q.cashOut) revert BalanceMismatch("debt");

        uint256 obligations = repaid + q.keeperCompensation + q.protocolFee;
        if (obligations > q.cashOut || q.cashOut - obligations < q.minNetSurplus) {
            revert Refused(Refusal.INSUFFICIENT_PROCEEDS);
        }

        Settlement memory s;
        s.borrower = q.borrower;
        s.maker = q.maker;
        s.keeper = msg.sender;
        s.collateralRecipient = q.collateralRecipient;
        s.keeperRecipient = q.keeperRecipient == address(0) ? msg.sender : q.keeperRecipient;
        s.surplusRecipient = q.surplusRecipient;
        s.debtToken = q.debtToken;
        s.collateralToken = q.collateralToken;
        s.cashOut = q.cashOut;
        s.repaidAssets = repaid;
        s.collateralAmount = seized;
        s.keeperCompensation = q.keeperCompensation;
        s.protocolFee = q.protocolFee;
        s.surplus = q.cashOut - obligations;
        s.adapterVersion = q.adapterVersion;
        s.policyVersion = m.policyVersion;
        {
            (, uint256 debtAfter) = lm.position(morphoId, q.borrower);
            uint256 reduced = debtBefore - debtAfter;
            s.writeoff = reduced > repaid ? reduced - repaid : 0;
        }

        collToken.safeTransfer(s.collateralRecipient, seized);
        if (s.keeperCompensation > 0) debtToken.safeTransfer(s.keeperRecipient, s.keeperCompensation);
        if (s.protocolFee > 0) debtToken.safeTransfer(feeRecipient, s.protocolFee);
        if (s.surplus > 0) debtToken.safeTransfer(s.surplusRecipient, s.surplus);

        if (debtToken.balanceOf(address(this)) != debtBal0 || collToken.balanceOf(address(this)) != collBal0) {
            revert BalanceMismatch("residual");
        }

        emit LiquidationSettled(jobId, quoteId, q.marketKey, s);
    }

    /// @notice Authenticated Morpho liquidation callback, valid only for the active job and its lending market.
    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external {
        if (stage != Stage.AwaitingCallback || msg.sender != _activeLendingMarket) revert UnexpectedCallback();
        if (abi.decode(data, (bytes32)) != _activeJobId) revert UnexpectedCallback();
        if (repaidAssets > _activeMaxRepay) revert Refused(Refusal.DEBT_ABOVE_BOUND);
        stage = Stage.CallbackDone;
        _callbackRepaid = repaidAssets;
        IERC20(_activeDebtToken).forceApprove(msg.sender, repaidAssets);
    }

    function _refuse(Preview memory p, Refusal r) internal pure returns (Preview memory) {
        p.reason = r;
        return p;
    }

    function _priceValid(MarketRegistry.Policy memory pol) internal view returns (bool) {
        (uint256 price, uint256 updatedAt, bool paused) = INectarPriceSource(pol.priceSource).latestObservation();
        if (paused || price == 0 || updatedAt > block.timestamp) return false;
        return block.timestamp - updatedAt <= pol.maxPriceAge;
    }

    function _sequencerUp(MarketRegistry.Policy memory pol) internal view returns (bool) {
        if (pol.sequencerFeed == address(0)) return true;
        (, int256 answer, uint256 startedAt,,) = ISequencerUptimeFeed(pol.sequencerFeed).latestRoundData();
        if (answer != 0) return false;
        return block.timestamp - startedAt > pol.sequencerGracePeriod;
    }
}
