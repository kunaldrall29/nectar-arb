// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPause} from "./IPause.sol";
import {NectarQuotes} from "./NectarQuotes.sol";
import {QuoteLib} from "./QuoteLib.sol";
import {RehearsalMarket} from "./RehearsalMarket.sol";
import {
    CollateralMismatch,
    Dust,
    Expired,
    Ineligible,
    InsufficientProceeds,
    MaxDebtExceeded,
    Mismatch,
    NotActive,
    PriceStale,
    PriceUnavailable,
    ScopePaused,
    Unauthorized,
    ZeroAddress
} from "./Errors.sol";

/// @notice Consumes one funded quote and liquidates the rehearsal market in the same transaction.
///         Any failed check reverts the whole settlement. Not audited. Not a Morpho adapter.
contract NectarExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    NectarQuotes public immutable quotes;
    NectarEscrowView public immutable escrow;
    RehearsalMarket public immutable market;
    IPause public immutable pause;
    address public immutable protocolFeeRecipient;

    event LiquidationSettled(
        uint256 indexed reservationId,
        address indexed maker,
        address indexed borrower,
        bytes32 marketKey,
        address debtToken,
        address collateralToken,
        uint256 debtRepaid,
        uint256 collateralDelivered,
        uint256 keeperCompensation,
        uint256 protocolFee,
        uint256 surplus,
        uint256 writeoff,
        address collateralRecipient,
        address keeper,
        uint256 price
    );

    constructor(address escrow_, address quotes_, address market_, address pause_, address protocolFeeRecipient_) {
        if (
            escrow_ == address(0) || quotes_ == address(0) || market_ == address(0) || pause_ == address(0)
                || protocolFeeRecipient_ == address(0)
        ) revert ZeroAddress();
        escrow = NectarEscrowView(escrow_);
        quotes = NectarQuotes(quotes_);
        market = RehearsalMarket(market_);
        pause = IPause(pause_);
        protocolFeeRecipient = protocolFeeRecipient_;
    }

    function preview(QuoteLib.Quote calldata q)
        external
        view
        returns (uint8 code, string memory reason, uint256 repay, uint256 seize, uint256 surplus)
    {
        (code, repay, seize, surplus) = _assess(q);
        reason = reasonOf(code);
    }

    function reasonOf(uint8 code) public pure returns (string memory) {
        if (code == 0) return "OK";
        if (code == 1) return "SCOPE_PAUSED";
        if (code == 2) return "MISMATCH";
        if (code == 3) return "EXPIRED";
        if (code == 4) return "BAD_MARKET";
        if (code == 5) return "PRICE_UNAVAILABLE";
        if (code == 6) return "PRICE_STALE";
        if (code == 7) return "INELIGIBLE";
        if (code == 8) return "MAX_DEBT";
        if (code == 9) return "COLLATERAL_MISMATCH";
        if (code == 10) return "INSUFFICIENT_PROCEEDS";
        if (code == 11) return "QUOTE_NOT_ACTIVE";
        if (code == 12) return "RECIPIENT";
        if (code == 13) return "BAD_PARAMETER";
        return "UNKNOWN";
    }

    function execute(QuoteLib.Quote calldata q) external nonReentrant {
        (uint8 code, uint256 repay, uint256 seize, uint256 surplus) = _assess(q);
        if (code == 1) revert ScopePaused();
        if (code == 2) revert Mismatch();
        if (code == 3) revert Expired();
        if (code == 4) revert Mismatch();
        if (code == 5) revert PriceUnavailable();
        if (code == 6) revert PriceStale();
        if (code == 7) revert Ineligible();
        if (code == 8) revert MaxDebtExceeded();
        if (code == 9) revert CollateralMismatch();
        if (code == 10) revert InsufficientProceeds();
        if (code == 11) revert NotActive();
        if (code == 12) revert ZeroAddress();
        if (code != 0) revert Mismatch();

        quotes.consume(q.reservationId);

        IERC20 debt = IERC20(q.debtToken);
        IERC20 collateral = IERC20(q.collateralToken);
        debt.forceApprove(address(market), repay);
        uint256 seized = market.liquidate(q.borrower, repay, seize);
        debt.forceApprove(address(market), 0);
        if (seized != seize) revert CollateralMismatch();
        collateral.safeTransfer(q.collateralRecipient, seized);
        if (q.keeperCompensation > 0) debt.safeTransfer(q.keeperRecipient, q.keeperCompensation);
        if (q.protocolFee > 0) debt.safeTransfer(protocolFeeRecipient, q.protocolFee);
        if (surplus > 0) debt.safeTransfer(q.surplusRecipient, surplus);
        if (debt.balanceOf(address(this)) != 0 || collateral.balanceOf(address(this)) != 0) revert Dust();

        emit LiquidationSettled(
            q.reservationId,
            q.maker,
            q.borrower,
            q.marketKey,
            q.debtToken,
            q.collateralToken,
            repay,
            seized,
            q.keeperCompensation,
            q.protocolFee,
            surplus,
            0,
            q.collateralRecipient,
            msg.sender,
            market.price()
        );
    }

    function _assess(QuoteLib.Quote calldata q)
        internal
        view
        returns (uint8 code, uint256 repay, uint256 seize, uint256 surplus)
    {
        if (pause.paused()) return (1, 0, 0, 0);
        if (q.schemaVersion != 1 || q.adapterVersion != 1) return (13, 0, 0, 0);
        if (
            q.marketKey != market.marketKey() || q.debtToken != address(market.debtToken())
                || q.collateralToken != address(market.collateralToken()) || q.policyHash != market.policyHash()
        ) return (4, 0, 0, 0);
        if (uint8(quotes.status(q.reservationId)) != 1) return (11, 0, 0, 0);
        if (quotes.quoteHash(q.reservationId) != QuoteLib.hash(q)) return (2, 0, 0, 0);
        if (block.timestamp >= q.validUntil) return (3, 0, 0, 0);
        if (q.collateralRecipient == address(0) || q.keeperRecipient == address(0) || q.surplusRecipient == address(0)) {
            return (12, 0, 0, 0);
        }
        if (
            q.collateralRecipient == address(this) || q.keeperRecipient == address(this)
                || q.surplusRecipient == address(this)
        ) return (12, 0, 0, 0);

        uint8 ps = market.priceStatus();
        if (ps == 1) return (5, 0, 0, 0);
        if (ps == 2) return (6, 0, 0, 0);
        if (!market.isLiquidatable(q.borrower)) return (7, 0, 0, 0);

        repay = market.debtOf(q.borrower);
        if (repay == 0 || repay > q.maxDebtRepay) return (8, 0, 0, 0);
        seize = market.seizureFor(repay);
        if (seize == 0 || seize != q.collateralAmount || market.collateralOf(q.borrower) < seize) return (9, 0, 0, 0);

        if (q.keeperCompensation > q.cashOut) return (10, 0, 0, 0);
        uint256 fees = q.keeperCompensation + q.protocolFee;
        if (fees < q.keeperCompensation || fees > q.cashOut) return (10, 0, 0, 0);
        uint256 afterFees = q.cashOut - fees;
        if (afterFees < repay) return (10, 0, 0, 0);
        surplus = afterFees - repay;
        if (surplus < q.minNetSurplus) return (10, 0, 0, 0);
        return (0, repay, seize, surplus        );
    }
}

interface NectarEscrowView {
    function executor() external view returns (address);
}
