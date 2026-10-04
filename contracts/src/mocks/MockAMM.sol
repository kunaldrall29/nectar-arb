// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";

/// @notice Preview/estimate comparison path. Optional swap for AMM-route tests.
contract MockAMM {
    mapping(bytes32 => uint256) public quotes;

    function setQuote(address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut) external {
        quotes[keccak256(abi.encode(tokenIn, amountIn, tokenOut))] = amountOut;
    }

    function estimate(address tokenIn, uint256 amountIn, address tokenOut) external view returns (uint256) {
        return quotes[keccak256(abi.encode(tokenIn, amountIn, tokenOut))];
    }

    function swap(address tokenIn, uint256 amountIn, address tokenOut, address to) external returns (uint256 out) {
        out = quotes[keccak256(abi.encode(tokenIn, amountIn, tokenOut))];
        require(out > 0, "NO_QUOTE");
        require(IERC20Minimal(tokenIn).transferFrom(msg.sender, address(this), amountIn), "IN");
        require(IERC20Minimal(tokenOut).transfer(to, out), "OUT");
    }
}
