// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PauseGuard
/// @notice Scoped emergency pause. The guardian can only block new reservations or executions;
///         it cannot move funds, change recipients or relax limits. Unpausing requires the recovery authority.
contract PauseGuard {
    address public guardian;
    address public recoveryAuthority;
    mapping(bytes32 => bool) public paused;

    event ScopePaused(bytes32 indexed scope, address indexed by);
    event ScopeUnpaused(bytes32 indexed scope, address indexed by);
    event GuardianChanged(address indexed guardian);

    error NotGuardian();
    error NotRecoveryAuthority();

    constructor(address guardian_, address recoveryAuthority_) {
        guardian = guardian_;
        recoveryAuthority = recoveryAuthority_;
        emit GuardianChanged(guardian_);
    }

    function pauseScope(bytes32 scope) external {
        if (msg.sender != guardian && msg.sender != recoveryAuthority) revert NotGuardian();
        paused[scope] = true;
        emit ScopePaused(scope, msg.sender);
    }

    function unpauseScope(bytes32 scope) external {
        if (msg.sender != recoveryAuthority) revert NotRecoveryAuthority();
        paused[scope] = false;
        emit ScopeUnpaused(scope, msg.sender);
    }

    function setGuardian(address g) external {
        if (msg.sender != recoveryAuthority) revert NotRecoveryAuthority();
        guardian = g;
        emit GuardianChanged(g);
    }

    function isPaused(bytes32 globalScope, bytes32 marketScope) external view returns (bool) {
        return paused[globalScope] || paused[marketScope];
    }
}
