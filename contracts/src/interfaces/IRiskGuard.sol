// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRiskGuard {
    event ScopePaused(bytes32 indexed scope, bool paused);
    event PriceUpdated(address indexed token, uint256 price, uint256 updatedAt);

    function pauseScope(bytes32 scope, bool paused) external;
    function isPaused(bytes32 scope) external view returns (bool);
    function setPrice(address token, uint256 price) external;
    function getPrice(address token) external view returns (uint256 price, uint256 updatedAt, bool valid);
    function assertExecutable(bytes32 marketKey, address debtToken, address collateralToken) external view;
}