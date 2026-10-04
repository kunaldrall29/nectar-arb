// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMockLending} from "../interfaces/INectarExecutor.sol";

/// @notice Simplified Morpho-like lending market for testnet demos.
contract MockLendingMarket is IMockLending, Ownable {
    using SafeERC20 for IERC20;

    mapping(bytes32 => Position) private _positions;
    uint256 private _posNonce;

    event PositionOpened(bytes32 indexed positionId, address indexed borrower, uint256 collateral, uint256 debt);
    event PositionLiquidated(bytes32 indexed positionId, address indexed liquidator, uint256 repay, uint256 seized);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function openPosition(
        address borrower,
        address collateralToken,
        address debtToken,
        uint256 collateralAmount,
        uint256 debtAmount,
        bool liquidatable
    ) external returns (bytes32 positionId) {
        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), collateralAmount);
        _posNonce++;
        positionId = keccak256(abi.encode(borrower, collateralToken, debtToken, _posNonce, block.timestamp));
        _positions[positionId] = Position({
            borrower: borrower,
            collateralToken: collateralToken,
            debtToken: debtToken,
            collateralAmount: collateralAmount,
            debtAmount: debtAmount,
            liquidatable: liquidatable
        });
        emit PositionOpened(positionId, borrower, collateralAmount, debtAmount);
    }

    function setLiquidatable(bytes32 positionId, bool liquidatable) external onlyOwner {
        _positions[positionId].liquidatable = liquidatable;
    }

    function getPosition(bytes32 positionId) external view returns (Position memory) {
        return _positions[positionId];
    }

    /// @notice Liquidator must approve/transfer debtToken repayAmount first (or have allowance).
    function liquidate(bytes32 positionId, uint256 repayAmount, address liquidator)
        external
        returns (uint256 seizedCollateral)
    {
        Position storage p = _positions[positionId];
        require(p.borrower != address(0), "missing");
        require(p.liquidatable, "healthy");
        require(repayAmount > 0 && repayAmount <= p.debtAmount, "repay");

        // Seize proportional collateral (full seize if full repay for MVP simplicity when repay == debt).
        if (repayAmount == p.debtAmount) {
            seizedCollateral = p.collateralAmount;
            p.collateralAmount = 0;
            p.debtAmount = 0;
            p.liquidatable = false;
        } else {
            seizedCollateral = (p.collateralAmount * repayAmount) / p.debtAmount;
            p.collateralAmount -= seizedCollateral;
            p.debtAmount -= repayAmount;
        }

        IERC20(p.debtToken).safeTransferFrom(msg.sender, address(this), repayAmount);
        IERC20(p.collateralToken).safeTransfer(liquidator, seizedCollateral);
        emit PositionLiquidated(positionId, liquidator, repayAmount, seizedCollateral);
    }
}