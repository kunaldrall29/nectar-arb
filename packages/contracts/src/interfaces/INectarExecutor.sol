// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INectarExecutor {
    function activeJobId() external view returns (bytes32);
}
