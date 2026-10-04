// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMockLending {
    struct Position {
        address borrower;
        address collateralToken;
        address debtToken;
        uint256 collateralAmount;
        uint256 debtAmount;
        bool liquidatable;
    }

    function openPosition(
        address borrower,
        address collateralToken,
        address debtToken,
        uint256 collateralAmount,
        uint256 debtAmount,
        bool liquidatable
    ) external returns (bytes32 positionId);

    function getPosition(bytes32 positionId) external view returns (Position memory);
    function liquidate(bytes32 positionId, uint256 repayAmount, address liquidator) external returns (uint256 seizedCollateral);
}

interface INectarExecutor {
    struct Job {
        bytes32 marketKey;
        bytes32 positionId;
        bytes32 quoteId;
        address borrower;
        address collateralToken;
        uint256 collateralAmount;
        address debtToken;
        uint256 maxDebtRepay;
        address collateralRecipient;
        address keeperRecipient;
        address surplusRecipient;
        uint256 keeperCompensation;
        uint256 protocolFee;
        uint256 minNetSurplus;
        uint256 deadline;
    }

    event LiquidationSettled(
        bytes32 indexed jobId,
        bytes32 indexed quoteId,
        bytes32 indexed positionId,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 keeperCompensation,
        uint256 protocolFee,
        uint256 surplus
    );

    function executeJob(Job calldata job) external returns (bytes32 jobId);
    function previewJob(Job calldata job) external view returns (bool ok, string memory reason);
}