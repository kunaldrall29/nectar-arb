// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarketRegistry {
    struct Market {
        bytes32 marketKey;
        uint256 chainId;
        address lendingProtocol;
        bytes32 marketId;
        address debtToken;
        address collateralToken;
        address adapter;
        uint256 adapterVersion;
        bytes32 policyHash;
        bool active;
        string label;
    }

    event MarketAdmitted(bytes32 indexed marketKey, address adapter, address debtToken, address collateralToken);
    event MarketDeactivated(bytes32 indexed marketKey);

    function admitMarket(Market calldata market) external;
    function deactivateMarket(bytes32 marketKey) external;
    function getMarket(bytes32 marketKey) external view returns (Market memory);
    function isActive(bytes32 marketKey) external view returns (bool);
}