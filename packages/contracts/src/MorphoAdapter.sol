// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {MockLendingMarket} from "./mocks/MockLendingMarket.sol";
import {RiskGuard} from "./RiskGuard.sol";

/// @title MorphoAdapter — testnet slice uses MockLendingMarket (Morpho Blue deferred; see README).
contract MorphoAdapter {
    using SafeERC20 for IERC20;

    MockLendingMarket public lendingMarket;
    RiskGuard public riskGuard;
    address public executor;
    address public feeRecipient;

    uint256 public constant ADAPTER_VERSION = 1;

    constructor(address lendingMarket_, address riskGuard_, address executor_, address feeRecipient_) {
        lendingMarket = MockLendingMarket(lendingMarket_);
        riskGuard = RiskGuard(riskGuard_);
        executor = executor_;
        feeRecipient = feeRecipient_;
    }

    struct SettlementParams {
        bytes32 marketKey;
        address borrower;
        uint256 collateralAmount;
        uint256 maxDebtRepay;
        bytes32 reservationId;
        address collateralRecipient;
        uint256 keeperCompensation;
        uint256 protocolFee;
        address keeperRecipient;
        address surplusRecipient;
        uint256 minNetSurplus;
        address collateralToken;
        address debtToken;
    }

    function executeSettlement(SettlementParams calldata params, uint256 cashIn)
        external
        returns (uint256 debtRepaid, uint256 surplus)
    {
        require(msg.sender == executor, "only executor");
        require(cashIn >= params.maxDebtRepay + params.keeperCompensation + params.protocolFee + params.minNetSurplus, "INSUFFICIENT_PROCEEDS");

        riskGuard.assertPriceValid(params.marketKey, params.collateralToken);

        IERC20 debt = IERC20(params.debtToken);
        debt.forceApprove(address(lendingMarket), params.maxDebtRepay);

        debtRepaid = lendingMarket.liquidate(
            params.borrower,
            params.collateralAmount,
            params.maxDebtRepay,
            params.collateralRecipient
        );

        if (params.keeperCompensation > 0) {
            debt.safeTransfer(params.keeperRecipient, params.keeperCompensation);
        }
        if (params.protocolFee > 0) {
            debt.safeTransfer(feeRecipient, params.protocolFee);
        }

        uint256 spent = debtRepaid + params.keeperCompensation + params.protocolFee;
        surplus = cashIn - spent;
        require(surplus >= params.minNetSurplus, "INSUFFICIENT_PROCEEDS");
        if (surplus > 0) {
            debt.safeTransfer(params.surplusRecipient, surplus);
        }
    }
}
