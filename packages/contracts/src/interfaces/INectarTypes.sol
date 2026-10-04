// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct FundedQuote {
    uint8 schemaVersion;
    uint256 chainId;
    address verifyingContract;
    address maker;
    uint256 makerNonce;
    bytes32 marketKey;
    uint8 adapterVersion;
    bytes32 positionKey;
    address collateralToken;
    uint256 collateralAmount;
    address debtToken;
    uint256 cashOut;
    uint256 maxDebtRepay;
    address collateralRecipient;
    uint256 keeperCompensation;
    uint256 protocolFee;
    uint256 minNetSurplus;
    address keeperRecipient;
    address surplusRecipient;
    uint64 validUntil;
    uint256 reservationId;
    bytes32 policyHash;
    uint256 quoteNonce;
}

struct ExecutionJob {
    bytes32 marketKey;
    bytes32 positionKey;
    uint256 reservationId;
    uint256 collateralAmount;
    uint256 debtRepay;
    uint8 routeType; // 0 = maker quote
    address adapter;
}

struct MarketConfig {
    bytes32 marketKey;
    uint256 chainId;
    address lendingProtocol;
    address debtToken;
    address collateralToken;
    address adapter;
    uint8 adapterVersion;
    bytes32 policyHash;
    bool active;
}
