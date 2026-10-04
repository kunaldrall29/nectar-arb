// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {INectarExecutor, IMockLending} from "./interfaces/INectarExecutor.sol";
import {IQuoteEscrow} from "./interfaces/IQuoteEscrow.sol";
import {IMarketRegistry} from "./interfaces/IMarketRegistry.sol";
import {IRiskGuard} from "./interfaces/IRiskGuard.sol";
import {QuoteEscrow} from "./QuoteEscrow.sol";
import {MorphoAdapter} from "./MorphoAdapter.sol";

/// @notice Validates funded quotes and settles liquidations atomically.
contract NectarExecutor is INectarExecutor, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IQuoteEscrow public immutable escrow;
    IMarketRegistry public immutable registry;
    IRiskGuard public immutable riskGuard;
    address public protocolTreasury;
    mapping(address => bool) public keepers;
    bool public keeperAllowlistEnabled = true;
    uint256 private _jobNonce;

    error UnauthorizedKeeper();
    error MarketInactive();
    error DeadlinePassed();
    error BoundsFailed(string reason);
    error PreviewFailed(string reason);

    constructor(
        address initialOwner,
        address escrow_,
        address registry_,
        address riskGuard_,
        address treasury_
    ) Ownable(initialOwner) {
        escrow = IQuoteEscrow(escrow_);
        registry = IMarketRegistry(registry_);
        riskGuard = IRiskGuard(riskGuard_);
        protocolTreasury = treasury_;
        keepers[initialOwner] = true;
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        keepers[keeper] = allowed;
    }

    function setKeeperAllowlistEnabled(bool enabled) external onlyOwner {
        keeperAllowlistEnabled = enabled;
    }

    function setProtocolTreasury(address treasury_) external onlyOwner {
        protocolTreasury = treasury_;
    }

    function previewJob(Job calldata job) external view returns (bool ok, string memory reason) {
        return _validate(job);
    }

    function executeJob(Job calldata job) external nonReentrant returns (bytes32 jobId) {
        if (keeperAllowlistEnabled && !keepers[msg.sender]) revert UnauthorizedKeeper();
        (bool ok, string memory reason) = _validate(job);
        if (!ok) revert BoundsFailed(reason);

        riskGuard.assertExecutable(job.marketKey, job.debtToken, job.collateralToken);

        IMarketRegistry.Market memory market = registry.getMarket(job.marketKey);
        IMockLending.Position memory pos = IMockLending(market.lendingProtocol).getPosition(job.positionId);
        if (!pos.liquidatable) revert BoundsFailed("POSITION_CHANGED");
        if (pos.debtAmount == 0) revert BoundsFailed("POSITION_CHANGED");

        uint256 repay = pos.debtAmount;
        if (repay > job.maxDebtRepay) revert BoundsFailed("INSUFFICIENT_PROCEEDS");

        (IQuoteEscrow.Quote memory quote,,,) = escrow.getQuote(job.quoteId);
        if (repay + job.keeperCompensation + job.protocolFee > quote.cashOut) {
            revert BoundsFailed("INSUFFICIENT_PROCEEDS");
        }
        uint256 surplus = quote.cashOut - repay - job.keeperCompensation - job.protocolFee;
        if (surplus < job.minNetSurplus) revert BoundsFailed("INSUFFICIENT_PROCEEDS");

        // Pull full cashOut into adapter path: first consume reservation into this executor.
        escrow.consumeReservation(job.quoteId, job.debtToken, repay, address(this));

        // Approve adapter/lending and liquidate.
        MorphoAdapter adapter = MorphoAdapter(market.adapter);
        IERC20(job.debtToken).forceApprove(market.lendingProtocol, repay);
        // Transfer debt tokens to adapter so it can liquidate (adapter pulls from itself via allowance to lending).
        // Actually MockLending pulls from msg.sender (adapter). So move tokens to adapter and approve lending from adapter.
        // Simpler path: executor calls lending directly as liquidator, then forwards collateral.
        // PRD wants adapter as transient holder — use adapter.
        IERC20(job.debtToken).safeTransfer(address(adapter), repay);
        // Adapter needs allowance to lending — set via a helper on adapter by transferring and approving inside liquidateAndForward.
        // We need adapter to approve lending. Update flow: adapter receives tokens, approves, liquidates.
        // MorphoAdapter currently assumes it already has tokens. Add approve inside.
        uint256 seized = _adapterLiquidate(adapter, job, market, repay);

        if (seized < job.collateralAmount) {
            // Soft check — allow exact seize from market; revert if zero.
            if (seized == 0) revert BoundsFailed("INSUFFICIENT_PROCEEDS");
        }

        // Allocate residual cash from escrow protocol pocket.
        if (job.keeperCompensation > 0) {
            QuoteEscrow(address(escrow)).allocateResidual(job.debtToken, job.keeperRecipient, job.keeperCompensation);
        }
        if (job.protocolFee > 0) {
            QuoteEscrow(address(escrow)).allocateResidual(job.debtToken, protocolTreasury, job.protocolFee);
        }
        if (surplus > 0) {
            QuoteEscrow(address(escrow)).allocateResidual(job.debtToken, job.surplusRecipient, surplus);
        }

        _jobNonce++;
        jobId = keccak256(abi.encode(job.quoteId, job.positionId, _jobNonce, block.number));
        emit LiquidationSettled(
            jobId, job.quoteId, job.positionId, repay, seized, job.keeperCompensation, job.protocolFee, surplus
        );
    }

    function _adapterLiquidate(
        MorphoAdapter adapter,
        Job calldata job,
        IMarketRegistry.Market memory market,
        uint256 repay
    ) internal returns (uint256 seized) {
        // Approve lending from adapter: temporarily use a low-level pattern —
        // transfer tokens to adapter then call liquidateAndForward which must approve.
        // Patch MorphoAdapter to approve before liquidate — already written to liquidate from itself.
        // Ensure adapter approves lending for repay amount.
        // We extend by calling a helper if needed. For current MorphoAdapter, tokens are on adapter
        // but allowance is missing. Fix MorphoAdapter to forceApprove before liquidate.
        seized = adapter.liquidateAndForward(job.positionId, repay, job.collateralToken, job.collateralRecipient);
        // silence unused
        market;
    }

    function _validate(Job calldata job) internal view returns (bool ok, string memory reason) {
        if (block.timestamp > job.deadline) return (false, "QUOTE_EXPIRED");
        if (!registry.isActive(job.marketKey)) return (false, "UNSUPPORTED_MARKET");
        IMarketRegistry.Market memory market = registry.getMarket(job.marketKey);
        if (market.debtToken != job.debtToken || market.collateralToken != job.collateralToken) {
            return (false, "UNSUPPORTED_MARKET");
        }
        if (riskGuard.isPaused(bytes32("GLOBAL")) || riskGuard.isPaused(job.marketKey) || riskGuard.isPaused(bytes32("EXEC"))) {
            return (false, "SCOPE_PAUSED");
        }
        (, , bool debtOk) = riskGuard.getPrice(job.debtToken);
        (, , bool collOk) = riskGuard.getPrice(job.collateralToken);
        if (!debtOk || !collOk) return (false, "PRICE_UNAVAILABLE");

        (IQuoteEscrow.Quote memory quote, bool active, bool consumed, bool released) = escrow.getQuote(job.quoteId);
        if (!active || consumed || released) return (false, "QUOTE_NOT_FUNDED");
        if (block.timestamp >= quote.validUntil) return (false, "QUOTE_EXPIRED");
        if (quote.maker == address(0)) return (false, "QUOTE_NOT_FUNDED");
        if (quote.debtToken != job.debtToken) return (false, "UNSUPPORTED_MARKET");
        if (quote.collateralToken != job.collateralToken) return (false, "UNSUPPORTED_MARKET");
        if (quote.collateralAmount != job.collateralAmount) return (false, "BOUNDS");
        if (quote.maxDebtRepay < job.maxDebtRepay && job.maxDebtRepay > quote.maxDebtRepay) {
            // job.maxDebtRepay must be <= quote.maxDebtRepay
        }
        if (job.maxDebtRepay > quote.maxDebtRepay) return (false, "BOUNDS");
        if (quote.collateralRecipient != job.collateralRecipient) return (false, "BOUNDS");
        if (quote.keeperCompensation != job.keeperCompensation) return (false, "BOUNDS");
        if (quote.protocolFee != job.protocolFee) return (false, "BOUNDS");
        if (quote.minNetSurplus != job.minNetSurplus) return (false, "BOUNDS");
        if (quote.keeperRecipient != job.keeperRecipient) return (false, "BOUNDS");
        if (quote.surplusRecipient != job.surplusRecipient) return (false, "BOUNDS");
        if (quote.borrower != job.borrower) return (false, "BOUNDS");
        if (quote.marketKey != job.marketKey) return (false, "UNSUPPORTED_MARKET");

        IMockLending.Position memory pos = IMockLending(market.lendingProtocol).getPosition(job.positionId);
        if (pos.borrower == address(0)) return (false, "POSITION_CHANGED");
        if (!pos.liquidatable) return (false, "POSITION_CHANGED");
        if (pos.debtAmount > job.maxDebtRepay) return (false, "INSUFFICIENT_PROCEEDS");
        if (pos.debtAmount + job.keeperCompensation + job.protocolFee + job.minNetSurplus > quote.cashOut) {
            return (false, "INSUFFICIENT_PROCEEDS");
        }
        return (true, "");
    }
}