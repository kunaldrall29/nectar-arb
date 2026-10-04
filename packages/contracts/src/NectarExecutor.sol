// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {QuoteEscrow} from "./QuoteEscrow.sol";
import {RiskGuard} from "./RiskGuard.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {MorphoAdapter} from "./MorphoAdapter.sol";
/// @title NectarExecutor — atomic bounded settlement (EX01–EX04).
contract NectarExecutor is Ownable {
    using SafeERC20 for IERC20;

    QuoteEscrow public escrow;
    RiskGuard public riskGuard;
    MarketRegistry public registry;

    bytes32 public activeJobId;

    event LiquidationSettled(
        bytes32 indexed jobId,
        bytes32 indexed marketKey,
        bytes32 indexed reservationId,
        address borrower,
        uint256 debtRepaid,
        uint256 collateralAmount,
        uint256 keeperCompensation,
        uint256 protocolFee,
        uint256 surplus
    );

    error JobExpired();
    error UnsupportedMarket();
    error JobInProgress();

    constructor(address escrow_, address riskGuard_, address registry_) Ownable(msg.sender) {
        escrow = QuoteEscrow(escrow_);
        riskGuard = RiskGuard(riskGuard_);
        registry = MarketRegistry(registry_);
    }

    struct JobRoute {
        bytes32 marketKey;
        address borrower;
        uint256 collateralAmount;
        uint256 maxDebtRepay;
        bytes32 reservationId;
        uint256 deadline;
        address collateralRecipient;
        uint256 keeperCompensation;
        uint256 protocolFee;
        address keeperRecipient;
        address surplusRecipient;
        uint256 minNetSurplus;
    }

    function executeJob(JobRoute calldata route) external returns (bytes32 jobId) {
        if (block.timestamp > route.deadline) revert JobExpired();
        if (activeJobId != bytes32(0)) revert JobInProgress();

        MarketRegistry.MarketPolicy memory market = registry.getMarket(route.marketKey);
        riskGuard.assertPriceValid(route.marketKey, market.collateralToken);

        QuoteEscrow.Reservation memory res = escrow.getReservation(route.reservationId);
        require(!res.consumed && !res.released, "quote unavailable");
        if (block.timestamp >= res.validUntil) revert JobExpired();

        jobId = keccak256(abi.encode(route.reservationId, block.number, msg.sender));
        activeJobId = jobId;

        escrow.consumeReservation(route.reservationId, address(this));

        uint256 cashHeld = IERC20(market.debtToken).balanceOf(address(this));
        IERC20(market.debtToken).safeTransfer(market.adapter, cashHeld);

        MorphoAdapter.SettlementParams memory params = MorphoAdapter.SettlementParams({
            marketKey: route.marketKey,
            borrower: route.borrower,
            collateralAmount: route.collateralAmount,
            maxDebtRepay: route.maxDebtRepay,
            reservationId: route.reservationId,
            collateralRecipient: route.collateralRecipient,
            keeperCompensation: route.keeperCompensation,
            protocolFee: route.protocolFee,
            keeperRecipient: route.keeperRecipient,
            surplusRecipient: route.surplusRecipient,
            minNetSurplus: route.minNetSurplus,
            collateralToken: market.collateralToken,
            debtToken: market.debtToken
        });

        (uint256 debtRepaid, uint256 surplus) = MorphoAdapter(market.adapter).executeSettlement(params, cashHeld);

        activeJobId = bytes32(0);

        emit LiquidationSettled(
            jobId,
            route.marketKey,
            route.reservationId,
            route.borrower,
            debtRepaid,
            route.collateralAmount,
            route.keeperCompensation,
            route.protocolFee,
            surplus
        );
    }

    function previewJob(JobRoute calldata route) external view returns (bool ok, string memory reason) {
        if (block.timestamp > route.deadline) return (false, "EXPIRED");
        if (!registry.isActive(route.marketKey)) return (false, "UNSUPPORTED_MARKET");
        QuoteEscrow.Reservation memory res = escrow.getReservation(route.reservationId);
        if (res.consumed) return (false, "QUOTE_CONSUMED");
        if (res.released) return (false, "QUOTE_RELEASED");
        if (block.timestamp >= res.validUntil) return (false, "QUOTE_EXPIRED");
        return (true, "");
    }
}
