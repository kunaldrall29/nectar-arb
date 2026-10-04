// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMarketRegistry} from "./interfaces/IMarketRegistry.sol";

contract MarketRegistry is IMarketRegistry, Ownable {
    mapping(bytes32 => Market) private _markets;
    bytes32[] public marketKeys;

    error MarketExists();
    error MarketMissing();
    error InvalidMarket();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function admitMarket(Market calldata market) external onlyOwner {
        if (market.marketKey == bytes32(0)) revert InvalidMarket();
        if (market.debtToken == address(0) || market.collateralToken == address(0) || market.adapter == address(0)) {
            revert InvalidMarket();
        }
        if (_markets[market.marketKey].marketKey != bytes32(0) && _markets[market.marketKey].active) {
            revert MarketExists();
        }
        bool first = _markets[market.marketKey].marketKey == bytes32(0);
        _markets[market.marketKey] = market;
        if (first) marketKeys.push(market.marketKey);
        emit MarketAdmitted(market.marketKey, market.adapter, market.debtToken, market.collateralToken);
    }

    function deactivateMarket(bytes32 marketKey) external onlyOwner {
        if (_markets[marketKey].marketKey == bytes32(0)) revert MarketMissing();
        _markets[marketKey].active = false;
        emit MarketDeactivated(marketKey);
    }

    function getMarket(bytes32 marketKey) external view returns (Market memory) {
        return _markets[marketKey];
    }

    function isActive(bytes32 marketKey) external view returns (bool) {
        return _markets[marketKey].active;
    }

    function marketCount() external view returns (uint256) {
        return marketKeys.length;
    }
}