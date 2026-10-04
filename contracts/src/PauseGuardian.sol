// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Unauthorized, ZeroAddress} from "./Errors.sol";

/// @notice Guardian can pause new reservations and executions. It cannot move maker cash.
contract PauseGuardian {
    address public immutable guardian;
    bool public paused;

    event ScopePaused(address indexed guardian, bool paused);

    constructor(address guardian_) {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
    }

    function pause() external {
        if (msg.sender != guardian) revert Unauthorized();
        paused = true;
        emit ScopePaused(msg.sender, true);
    }

    function unpause() external {
        if (msg.sender != guardian) revert Unauthorized();
        paused = false;
        emit ScopePaused(msg.sender, false);
    }
}
