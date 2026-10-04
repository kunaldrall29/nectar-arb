// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {InsufficientProceeds, Unauthorized, ZeroAddress, ZeroAmount} from "./Errors.sol";

interface IBoundedRouter {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, address receiver) external returns (uint256);
}

/// @notice Approved external sale. Output below `minOut` reverts and the whole job unwinds.
contract ExternalSwapAdapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable adapter;
    address public immutable router;

    constructor(address adapter_, address router_) {
        if (adapter_ == address(0) || router_ == address(0)) revert ZeroAddress();
        adapter = adapter_;
        router = router_;
    }

    function sell(address tokenIn, uint256 amountIn, address tokenOut, uint256 minOut, bytes calldata)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (msg.sender != adapter) revert Unauthorized();
        if (amountIn == 0 || minOut == 0) revert ZeroAmount();
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(router, amountIn);
        uint256 beforeOut = IERC20(tokenOut).balanceOf(address(this));
        IBoundedRouter(router).swap(tokenIn, tokenOut, amountIn, address(this));
        IERC20(tokenIn).forceApprove(router, 0);
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - beforeOut;
        if (amountOut < minOut) revert InsufficientProceeds();
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }
}
