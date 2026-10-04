// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Testnet mock oracle — labeled per PRD PX05.
contract MockOracle {
    mapping(address => uint256) public prices;
    mapping(address => uint256) public updatedAt;
    mapping(address => bool) public paused;
    uint256 public maxAge = 1 hours;

    function setPrice(address asset, uint256 price, uint256 timestamp) external {
        prices[asset] = price;
        updatedAt[asset] = timestamp;
    }

    function setPaused(address asset, bool isPaused) external {
        paused[asset] = isPaused;
    }

    function setMaxAge(uint256 age) external {
        maxAge = age;
    }

    function getPrice(address asset) external view returns (uint256 price, uint256 timestamp, bool isValid) {
        if (paused[asset]) {
            return (0, 0, false);
        }
        uint256 ts = updatedAt[asset];
        if (ts == 0 || block.timestamp > ts + maxAge) {
            return (prices[asset], ts, false);
        }
        return (prices[asset], ts, true);
    }
}
