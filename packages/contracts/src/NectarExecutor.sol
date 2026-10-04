// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FundedQuote, ExecutionJob, MarketConfig} from "./interfaces/INectarTypes.sol";
import {QuoteEscrow} from "./QuoteEscrow.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {DemoLiquidationAdapter} from "./DemoLiquidationAdapter.sol";

/// @title NectarExecutor — atomic maker-route settlement (testnet pilot)
contract NectarExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    QuoteEscrow public immutable escrow;
    MarketRegistry public immutable registry;
    address public guardian;
    bool public executionPaused;

    bytes32 public constant GLOBAL_SCOPE = bytes32("GLOBAL");

    event LiquidationSettled(
        bytes32 indexed marketKey,
        uint256 indexed reservationId,
        uint256 debtRepay,
        uint256 collateralAmount,
        uint256 keeperCompensation,
        uint256 protocolFee,
        uint256 surplus,
        address keeper
    );

    error ExecutionPaused();
    error MarketPaused();
    error MarketInactive();
    error DebtExceedsBound();
    error InsufficientProceeds();
    error WrongAdapter();

    constructor(QuoteEscrow escrow_, MarketRegistry registry_, address guardian_) {
        escrow = escrow_;
        registry = registry_;
        guardian = guardian_;
    }

    function pauseExecution(bool paused) external {
        require(msg.sender == guardian, "auth");
        executionPaused = paused;
    }

    function previewJob(ExecutionJob calldata job)
        external
        view
        returns (bool ok, string memory reason)
    {
        if (executionPaused) return (false, "SCOPE_PAUSED");
        if (registry.scopePaused(GLOBAL_SCOPE)) return (false, "SCOPE_PAUSED");
        MarketConfig memory m = registry.getMarket(job.marketKey);
        if (!m.active) return (false, "UNSUPPORTED_MARKET");
        if (registry.scopePaused(job.marketKey)) return (false, "SCOPE_PAUSED");
        QuoteEscrow.Reservation memory r = escrow.getReservation(job.reservationId);
        if (r.maker == address(0)) return (false, "QUOTE_NOT_FUNDED");
        if (r.consumed || r.released) return (false, "QUOTE_NOT_FUNDED");
        if (block.timestamp >= r.validUntil) return (false, "QUOTE_EXPIRED");
        if (job.debtRepay > r.amount) return (false, "INSUFFICIENT_PROCEEDS");
        return (true, "");
    }

    function executeJob(ExecutionJob calldata job, FundedQuote calldata quote)
        external
        nonReentrant
        returns (uint256 debtRepay)
    {
        if (executionPaused) revert ExecutionPaused();
        if (registry.scopePaused(GLOBAL_SCOPE)) revert MarketPaused();

        MarketConfig memory m = registry.getMarket(job.marketKey);
        if (!m.active) revert MarketInactive();
        if (registry.scopePaused(job.marketKey)) revert MarketPaused();
        if (job.adapter != m.adapter) revert WrongAdapter();

        if (job.debtRepay > quote.maxDebtRepay) revert DebtExceedsBound();

        uint256 totalOut =
            job.debtRepay + quote.keeperCompensation + quote.protocolFee + quote.minNetSurplus;
        if (totalOut > quote.cashOut) revert InsufficientProceeds();

        escrow.consumeReservation(job.reservationId, msg.sender);

        escrow.transferForSettlement(m.debtToken, m.lendingProtocol, job.debtRepay);
        escrow.transferForSettlement(m.debtToken, quote.keeperRecipient, quote.keeperCompensation);
        escrow.transferForSettlement(m.debtToken, address(this), quote.protocolFee);
        if (quote.minNetSurplus > 0) {
            escrow.transferForSettlement(m.debtToken, quote.surplusRecipient, quote.minNetSurplus);
        }

        DemoLiquidationAdapter(m.adapter).settleDemo(
            m.debtToken,
            address(0),
            0,
            quote.collateralRecipient,
            job.collateralAmount
        );

        emit LiquidationSettled(
            job.marketKey,
            job.reservationId,
            job.debtRepay,
            job.collateralAmount,
            quote.keeperCompensation,
            quote.protocolFee,
            quote.minNetSurplus,
            msg.sender
        );

        return job.debtRepay;
    }
}
