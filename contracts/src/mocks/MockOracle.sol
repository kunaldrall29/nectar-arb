// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Labeled mock price feed. Never present as a production oracle.
contract MockOracle {
    int256 public price;
    uint256 public updatedAt;
    bool public feedPaused;
    bytes32 public feedId;
    bool public wrongFeed;

    constructor(int256 price_, bytes32 feedId_) {
        price = price_;
        updatedAt = block.timestamp;
        feedId = feedId_;
    }

    function set(int256 price_, uint256 updatedAt_, bool paused_) external {
        price = price_;
        updatedAt = updatedAt_;
        feedPaused = paused_;
    }

    function setWrong(bool w) external {
        wrongFeed = w;
    }

    function latest() external view returns (int256, uint256, bool, bytes32) {
        if (wrongFeed) return (price, updatedAt, feedPaused, keccak256("WRONG"));
        return (price, updatedAt, feedPaused, feedId);
    }
}
