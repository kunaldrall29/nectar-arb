// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracle {
    /// @notice Price of 1 base unit of collateral in loan-token base units, scaled by 1e36 (Morpho convention).
    function price() external view returns (uint256);
    function updatedAt() external view returns (uint256);
    function paused() external view returns (bool);
}
