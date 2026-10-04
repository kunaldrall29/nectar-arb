// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Unauthorized, ZeroAddress} from "./Errors.sol";

/// @notice Guardian can pause new reservations and executions. It cannot move maker cash.
contract PauseGuardian is Pausable {
    address public immutable guardian;

    event ScopePaused(address indexed guardian, bool paused);

    constructor(address guardian_) {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
    }

    function pause() external {
        if (msg.sender != guardian) revert Unauthorized();
        _pause();
        emit ScopePaused(msg.sender, true);
    }

    function unpause() external {
        if (msg.sender != guardian) revert Unauthorized();
        _unpause();
        emit ScopePaused(msg.sender, false);
    }
}
