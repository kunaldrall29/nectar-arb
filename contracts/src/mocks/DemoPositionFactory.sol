// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MiniMorpho} from "../lending/MiniMorpho.sol";
import {MarketParams} from "../lending/IMiniMorpho.sol";

/// @notice TESTNET ONLY. A borrower account controlled by its creator; used to seed demo loan positions.
contract DemoBorrower {
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public immutable factory;
    MiniMorpho public immutable lending;

    constructor(address owner_, MiniMorpho lending_) {
        owner = owner_;
        factory = msg.sender;
        lending = lending_;
    }

    function open(MarketParams calldata params, uint256 collateral, uint256 borrowAmount) external {
        require(msg.sender == factory, "only factory");
        IERC20(params.collateralToken).forceApprove(address(lending), collateral);
        lending.supplyCollateral(params, collateral, address(this));
        lending.borrow(params, borrowAmount, address(this), owner);
    }
}

/// @title DemoPositionFactory
/// @notice TESTNET ONLY. Opens a borrower position in one call so the demo can create fresh liquidation
/// candidates. The caller supplies collateral; borrowed debt tokens go to the caller.
contract DemoPositionFactory {
    using SafeERC20 for IERC20;

    MiniMorpho public immutable lending;
    address[] public borrowers;

    event PositionOpened(
        address indexed borrower, address indexed owner, bytes32 indexed marketId, uint256 collateral, uint256 debt
    );

    constructor(MiniMorpho lending_) {
        lending = lending_;
    }

    function open(MarketParams calldata params, uint256 collateral, uint256 borrowAmount)
        external
        returns (address borrower)
    {
        DemoBorrower b = new DemoBorrower(msg.sender, lending);
        IERC20(params.collateralToken).safeTransferFrom(msg.sender, address(b), collateral);
        b.open(params, collateral, borrowAmount);
        borrowers.push(address(b));
        emit PositionOpened(address(b), msg.sender, lending.idOf(params), collateral, borrowAmount);
        return address(b);
    }

    function borrowerCount() external view returns (uint256) {
        return borrowers.length;
    }

    function allBorrowers() external view returns (address[] memory) {
        return borrowers;
    }
}
