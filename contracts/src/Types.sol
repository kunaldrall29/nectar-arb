// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Shared product types for Nectar R1 (testnet vertical slice).
library Types {
    uint256 internal constant SCHEMA_VERSION = 1;
    uint256 internal constant DEFAULT_QUOTE_LIFETIME = 30;
    uint256 internal constant MAX_QUOTE_LIFETIME = 120;

    uint8 internal constant ROUTE_MAKER = 0;
    uint8 internal constant ROUTE_AMM = 1;

    bytes32 internal constant SCOPE_RESERVATIONS = keccak256("RESERVATIONS");
    bytes32 internal constant SCOPE_EXECUTIONS = keccak256("EXECUTIONS");

    struct Quote {
        uint256 schemaVersion;
        uint256 chainId;
        address verifyingContract;
        address maker;
        uint256 makerNonce;
        bytes32 marketKey;
        uint256 adapterVersion;
        address borrower;
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
        uint256 validUntil;
        bytes32 reservationId;
        bytes32 policyHash;
        uint256 quoteNonce;
    }

    struct Job {
        bytes32 marketKey;
        address borrower;
        uint256 seizedCollateral;
        uint256 maxDebtRepay;
        bytes32 quoteId;
        uint256 deadline;
        address keeper;
    }

    struct Route {
        uint8 kind;
        address amm;
        uint256 minOut;
    }

    struct Market {
        bytes32 marketKey;
        uint256 chainId;
        address protocol;
        bytes32 morphoMarketId;
        address adapter;
        uint256 adapterVersion;
        address debtToken;
        address collateralToken;
        address oracle;
        address sequencer;
        uint256 lltv;
        bool admitted;
        bool mockLabeled;
    }

    struct Policy {
        uint256 version;
        bytes32 hash;
        uint256 maxQuoteLifetime;
        uint256 minPriceFreshness;
        uint256 sequencerGrace;
        address protocolFeeRecipient;
        bool ammEnabled;
    }

    struct PreviewResult {
        bool ok;
        bytes32 reason;
        uint256 expectedDebtRepay;
        uint256 expectedCollateral;
        uint256 keeperCompensation;
        uint256 protocolFee;
        uint256 surplus;
        uint256 ammEstimate;
    }
}
