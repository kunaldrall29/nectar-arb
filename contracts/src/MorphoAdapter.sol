// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMockLending} from "./interfaces/INectarExecutor.sol";

/// @notice Transient adapter that liquidates via MockLendingMarket on behalf of the executor.
contract MorphoAdapter {
    using SafeERC20 for IERC20;

    address public immutable executor;
    address public immutable lending;

    error Unauthorized();

    constructor(address executor_, address lending_) {
        executor = executor_;
        lending = lending_;
    }

    modifier onlyExecutor() {
        if (msg.sender != executor) revert Unauthorized();
        _;
    }

    function liquidateAndForward(
        bytes32 positionId,
        uint256 repayAmount,
        address collateralToken,
        address collateralRecipient
    ) external onlyExecutor returns (uint256 seized) {
        IMockLending.Position memory pos = IMockLending(lending).getPosition(positionId);
        IERC20(pos.debtToken).forceApprove(lending, repayAmount);
        seized = IMockLending(lending).liquidate(positionId, repayAmount, address(this));
        IERC20(collateralToken).safeTransfer(collateralRecipient, seized);
    }
}