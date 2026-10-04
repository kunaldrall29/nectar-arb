// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketConfig} from "./interfaces/INectarTypes.sol";

/// @title MarketRegistry — versioned market admission (no fund movement)
contract MarketRegistry {
    address public governance;
    address public guardian;

    mapping(bytes32 => MarketConfig) public markets;
    mapping(bytes32 => bool) public scopePaused;

    event MarketAdmitted(bytes32 indexed marketKey, address adapter, bytes32 policyHash);
    event ScopePaused(bytes32 indexed scope, bool paused);

    error Unauthorized();
    error MarketExists();
    error MarketUnknown();

    constructor(address governance_, address guardian_) {
        governance = governance_;
        guardian = guardian_;
    }

    function admitMarket(MarketConfig calldata config) external {
        if (msg.sender != governance) revert Unauthorized();
        if (markets[config.marketKey].lendingProtocol != address(0)) revert MarketExists();
        markets[config.marketKey] = config;
        emit MarketAdmitted(config.marketKey, config.adapter, config.policyHash);
    }

    function pauseScope(bytes32 scope, bool paused) external {
        if (msg.sender != guardian && msg.sender != governance) revert Unauthorized();
        scopePaused[scope] = paused;
        emit ScopePaused(scope, paused);
    }

    function getMarket(bytes32 marketKey) external view returns (MarketConfig memory) {
        MarketConfig memory m = markets[marketKey];
        if (m.lendingProtocol == address(0)) revert MarketUnknown();
        return m;
    }
}
