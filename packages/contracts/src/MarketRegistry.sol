// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MarketRegistry — admits exact markets with versioned policy (MK04).
contract MarketRegistry is Ownable {
    constructor() Ownable(msg.sender) {}

    struct MarketPolicy {
        uint256 chainId;
        address lendingMarket;
        address debtToken;
        address collateralToken;
        address oracle;
        address adapter;
        uint256 adapterVersion;
        bytes32 policyHash;
        bool active;
    }

    mapping(bytes32 => MarketPolicy) public markets;

    event MarketAdmitted(bytes32 indexed marketKey, MarketPolicy policy);
    event MarketDeactivated(bytes32 indexed marketKey);

    function admitMarket(bytes32 marketKey, MarketPolicy calldata policy) external onlyOwner {
        require(policy.lendingMarket != address(0), "invalid market");
        require(!markets[marketKey].active, "already active");
        markets[marketKey] = policy;
        markets[marketKey].active = true;
        emit MarketAdmitted(marketKey, policy);
    }

    function deactivateMarket(bytes32 marketKey) external onlyOwner {
        require(markets[marketKey].active, "not active");
        markets[marketKey].active = false;
        emit MarketDeactivated(marketKey);
    }

    function getMarket(bytes32 marketKey) external view returns (MarketPolicy memory) {
        MarketPolicy memory m = markets[marketKey];
        require(m.active, "unsupported market");
        return m;
    }

    function isActive(bytes32 marketKey) external view returns (bool) {
        return markets[marketKey].active;
    }
}
