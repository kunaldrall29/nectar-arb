// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Types} from "./Types.sol";
import {QuoteLib} from "./libraries/QuoteLib.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {QuoteEscrow} from "./QuoteEscrow.sol";
import {RiskGuard} from "./RiskGuard.sol";
import {MockMorpho} from "./mocks/MockMorpho.sol";
import {MockAMM} from "./mocks/MockAMM.sol";
import {
    Unauthorized,
    NestedJob,
    UnexpectedCallback,
    QUOTE_NOT_FUNDED,
    QUOTE_EXPIRED,
    InvalidQuote,
    UNSUPPORTED_MARKET,
    INSUFFICIENT_PROCEEDS,
    POSITION_CHANGED
} from "./Errors.sol";

interface IMorphoBlueAdapter {
    function execute(Types.Job calldata job, Types.Quote calldata quote, Types.Route calldata route, bytes32 morphoMarketId)
        external;
}

/// @notice Validates bounded jobs and coordinates atomic settlement.
///         Accepts only the designated adapter during the expected callback stage.
contract NectarExecutor {
    enum Stage {
        None,
        Active,
        Callback
    }

    MarketRegistry public immutable registry;
    QuoteEscrow public immutable escrow;
    RiskGuard public immutable riskGuard;
    address public owner;

    bool public keeperAllowlistEnabled;
    mapping(address => bool) public allowedKeepers;

    Stage public stage;
    address public activeAdapter;
    bytes32 public activeJobId;
    bytes32 public activeQuoteId;
    uint8 public activeRouteKind;

    uint256 public lastDebtRepaid;
    uint256 public lastCollateral;
    uint256 public lastKeeperComp;
    uint256 public lastProtocolFee;
    uint256 public lastSurplus;

    event LiquidationSettled(
        bytes32 indexed jobId,
        bytes32 indexed marketKey,
        bytes32 indexed quoteId,
        address borrower,
        uint256 debtRepaid,
        uint256 collateralDelivered,
        uint256 keeperCompensation,
        uint256 protocolFee,
        uint256 surplus,
        uint256 writeoff
    );

    event KeeperAllowlistUpdated(address indexed keeper, bool allowed, bool enabled);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, address registry_, address escrow_, address riskGuard_) {
        owner = owner_;
        registry = MarketRegistry(registry_);
        escrow = QuoteEscrow(escrow_);
        riskGuard = RiskGuard(riskGuard_);
    }

    function setKeeperAllowlistEnabled(bool enabled) external onlyOwner {
        keeperAllowlistEnabled = enabled;
        emit KeeperAllowlistUpdated(address(0), false, enabled);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        allowedKeepers[keeper] = allowed;
        emit KeeperAllowlistUpdated(keeper, allowed, keeperAllowlistEnabled);
    }

    function executeJob(Types.Job calldata job, Types.Quote calldata quote, Types.Route calldata route) external {
        if (stage != Stage.None) revert NestedJob();
        if (keeperAllowlistEnabled && !allowedKeepers[msg.sender]) revert Unauthorized();
        registry.requireNotPaused(Types.SCOPE_EXECUTIONS, job.marketKey);
        if (job.deadline < block.timestamp) revert QUOTE_EXPIRED();

        Types.Market memory market = registry.getMarket(job.marketKey);
        if (!market.admitted) revert UNSUPPORTED_MARKET();
        Types.Policy memory policy = registry.getPolicy(job.marketKey);

        riskGuard.check(market.oracle, market.sequencer, policy.minPriceFreshness, policy.sequencerGrace);

        bytes32 qid = QuoteLib.quoteId(quote);
        if (qid != job.quoteId) revert InvalidQuote();
        if (quote.borrower != job.borrower || quote.marketKey != job.marketKey) revert InvalidQuote();
        if (quote.collateralAmount != job.seizedCollateral) revert InvalidQuote();
        if (job.maxDebtRepay > quote.maxDebtRepay) revert InvalidQuote();

        if (route.kind == Types.ROUTE_MAKER) {
            QuoteEscrow.QuoteRecord memory rec = escrow.getQuote(qid);
            if (!rec.reserved || rec.consumed || rec.released) revert QUOTE_NOT_FUNDED();
            if (block.timestamp >= rec.validUntil || block.timestamp >= quote.validUntil) revert QUOTE_EXPIRED();
        } else if (route.kind == Types.ROUTE_AMM) {
            if (!policy.ammEnabled) revert UNSUPPORTED_MARKET();
        } else {
            revert InvalidQuote();
        }

        if (!MockMorpho(market.protocol).isUnhealthy(market.morphoMarketId, job.borrower)) {
            revert POSITION_CHANGED();
        }

        bytes32 jobId = _jobId(job);
        stage = Stage.Active;
        activeAdapter = market.adapter;
        activeJobId = jobId;
        activeQuoteId = qid;
        activeRouteKind = route.kind;
        lastDebtRepaid = 0;
        lastCollateral = job.seizedCollateral;
        lastKeeperComp = quote.keeperCompensation;
        lastProtocolFee = quote.protocolFee;
        lastSurplus = 0;

        IMorphoBlueAdapter(market.adapter).execute(job, quote, route, market.morphoMarketId);

        if (stage != Stage.Callback) revert UnexpectedCallback();
        stage = Stage.None;
        activeAdapter = address(0);

        uint256 writeoff = 0;
        emit LiquidationSettled(
            jobId,
            job.marketKey,
            qid,
            job.borrower,
            lastDebtRepaid,
            lastCollateral,
            lastKeeperComp,
            lastProtocolFee,
            lastSurplus,
            writeoff
        );
    }

    function settleExpectedCallback(bytes32 jobId, uint256 repaid, Types.Quote calldata quote, uint8 routeKind)
        external
    {
        if (msg.sender != activeAdapter) revert UnexpectedCallback();
        if (stage != Stage.Active) revert UnexpectedCallback();
        if (jobId != activeJobId) revert UnexpectedCallback();
        if (QuoteLib.quoteId(quote) != activeQuoteId) revert UnexpectedCallback();
        stage = Stage.Callback;

        if (routeKind == Types.ROUTE_MAKER) {
            escrow.consume(activeQuoteId, msg.sender, jobId);
            uint256 obligated = repaid + quote.keeperCompensation + quote.protocolFee;
            if (quote.cashOut < obligated + quote.minNetSurplus) revert INSUFFICIENT_PROCEEDS();
            lastSurplus = quote.cashOut - obligated;
        } else {
            lastSurplus = 0;
        }
        lastDebtRepaid = repaid;
        lastKeeperComp = quote.keeperCompensation;
        lastProtocolFee = quote.protocolFee;
    }

    function previewJob(Types.Job calldata job, Types.Quote calldata quote, Types.Route calldata route)
        external
        view
        returns (Types.PreviewResult memory r)
    {
        r.reason = bytes32("OK");
        Types.Market memory market = registry.getMarket(job.marketKey);
        if (!market.admitted) {
            return _fail("UNSUPPORTED_MARKET");
        }
        if (registry.isPaused(Types.SCOPE_EXECUTIONS) || registry.isPaused(job.marketKey)) {
            return _fail("SCOPE_PAUSED");
        }
        Types.Policy memory policy = registry.getPolicy(job.marketKey);
        try riskGuard.check(market.oracle, market.sequencer, policy.minPriceFreshness, policy.sequencerGrace) {}
        catch {
            return _fail("PRICE_UNAVAILABLE");
        }
        if (job.deadline < block.timestamp || quote.validUntil <= block.timestamp) {
            return _fail("QUOTE_EXPIRED");
        }
        bytes32 qid = QuoteLib.quoteId(quote);
        if (qid != job.quoteId) return _fail("INVALID_QUOTE");

        uint256 expectedRepay = MockMorpho(market.protocol).previewRepay(market.morphoMarketId, job.borrower, job.seizedCollateral);
        r.expectedDebtRepay = expectedRepay;
        r.expectedCollateral = job.seizedCollateral;
        r.keeperCompensation = quote.keeperCompensation;
        r.protocolFee = quote.protocolFee;

        uint256 ammOut = 0;
        if (route.amm != address(0)) {
            ammOut = MockAMM(route.amm).estimate(quote.collateralToken, job.seizedCollateral, quote.debtToken);
        }
        r.ammEstimate = ammOut;

        if (route.kind == Types.ROUTE_MAKER) {
            QuoteEscrow.QuoteRecord memory rec = escrow.getQuote(qid);
            if (!rec.reserved || rec.consumed) return _fail("QUOTE_NOT_FUNDED");
            uint256 obligated = expectedRepay + quote.keeperCompensation + quote.protocolFee + quote.minNetSurplus;
            if (quote.cashOut < obligated || expectedRepay > quote.maxDebtRepay) {
                r.ok = false;
                r.reason = bytes32("INSUFFICIENT_PROCEEDS");
                return r;
            }
            r.surplus = quote.cashOut - expectedRepay - quote.keeperCompensation - quote.protocolFee;
        } else {
            uint256 obligated = expectedRepay + quote.keeperCompensation + quote.protocolFee + quote.minNetSurplus;
            if (ammOut < obligated) {
                r.ok = false;
                r.reason = bytes32("INSUFFICIENT_PROCEEDS");
                return r;
            }
            r.surplus = ammOut - expectedRepay - quote.keeperCompensation - quote.protocolFee;
        }

        if (!MockMorpho(market.protocol).isUnhealthy(market.morphoMarketId, job.borrower)) {
            return _fail("POSITION_CHANGED");
        }
        r.ok = true;
        r.reason = bytes32("OK");
    }

    function _fail(bytes32 reason) private pure returns (Types.PreviewResult memory r) {
        r.ok = false;
        r.reason = reason;
    }

    function _jobId(Types.Job calldata job) private pure returns (bytes32) {
        return keccak256(abi.encode(job.marketKey, job.borrower, job.quoteId, job.deadline, job.seizedCollateral, job.keeper));
    }
}
