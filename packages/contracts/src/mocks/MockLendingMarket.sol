// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Simplified lending market for testnet — not Morpho Blue production (PX05).
contract MockLendingMarket {
    using SafeERC20 for IERC20;

    struct Position {
        address borrower;
        address collateralToken;
        address debtToken;
        uint256 collateral;
        uint256 debt;
        bool exists;
    }

    mapping(address => Position) public positions;

    event PositionOpened(address indexed borrower, address collateralToken, address debtToken, uint256 collateral, uint256 debt);
    event Liquidated(address indexed borrower, uint256 debtRepaid, uint256 collateralSeized, address liquidator);

    function openPosition(
        address borrower,
        address collateralToken,
        address debtToken,
        uint256 collateralAmount,
        uint256 debtAmount
    ) external {
        IERC20(collateralToken).safeTransferFrom(borrower, address(this), collateralAmount);
        positions[borrower] = Position({
            borrower: borrower,
            collateralToken: collateralToken,
            debtToken: debtToken,
            collateral: collateralAmount,
            debt: debtAmount,
            exists: true
        });
        emit PositionOpened(borrower, collateralToken, debtToken, collateralAmount, debtAmount);
    }

    function liquidate(
        address borrower,
        uint256 collateralToSeize,
        uint256 maxDebtRepay,
        address liquidator
    ) external returns (uint256 debtRepaid) {
        Position storage p = positions[borrower];
        require(p.exists, "no position");
        require(collateralToSeize <= p.collateral, "collateral");

        debtRepaid = maxDebtRepay > p.debt ? p.debt : maxDebtRepay;
        require(debtRepaid > 0, "zero debt");

        IERC20(p.debtToken).safeTransferFrom(msg.sender, address(this), debtRepaid);
        p.debt -= debtRepaid;
        p.collateral -= collateralToSeize;

        IERC20(p.collateralToken).safeTransfer(liquidator, collateralToSeize);

        if (p.debt == 0 && p.collateral == 0) {
            p.exists = false;
        }

        emit Liquidated(borrower, debtRepaid, collateralToSeize, liquidator);
    }
}
