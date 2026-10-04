// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract MockSequencer {
    bool public up = true;
    uint256 public startedAt;

    constructor() {
        startedAt = block.timestamp;
    }

    function set(bool up_, uint256 startedAt_) external {
        up = up_;
        startedAt = startedAt_;
    }

    function status() external view returns (bool, uint256) {
        return (up, startedAt);
    }
}
