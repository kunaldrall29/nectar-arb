// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Exact single-fill funded purchase quote (PRD section 8).
/// @dev keeperRecipient == address(0) means "the keeper that submits the job".
///      reservationId is the EIP-712 digest of the quote (domain-bound to chain + QuoteRegistry).
struct Quote {
    uint16 schemaVersion;
    address maker;
    uint256 makerNonce;
    bytes32 marketKey;
    uint32 adapterVersion;
    address borrower;
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
    bytes32 policyHash;
    uint256 quoteNonce;
}

enum QuoteStatus {
    None,
    Active,
    Consumed,
    Released
}

library QuoteLib {
    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "Quote(uint16 schemaVersion,address maker,uint256 makerNonce,bytes32 marketKey,uint32 adapterVersion,address borrower,address collateralToken,uint256 collateralAmount,address debtToken,uint256 cashOut,uint256 maxDebtRepay,address collateralRecipient,uint256 keeperCompensation,uint256 protocolFee,uint256 minNetSurplus,address keeperRecipient,address surplusRecipient,uint64 validUntil,bytes32 policyHash,uint256 quoteNonce)"
    );

    function hashStruct(Quote memory q) internal pure returns (bytes32) {
        bytes memory a = abi.encode(
            QUOTE_TYPEHASH,
            q.schemaVersion,
            q.maker,
            q.makerNonce,
            q.marketKey,
            q.adapterVersion,
            q.borrower,
            q.collateralToken,
            q.collateralAmount,
            q.debtToken,
            q.cashOut
        );
        bytes memory b = abi.encode(
            q.maxDebtRepay,
            q.collateralRecipient,
            q.keeperCompensation,
            q.protocolFee,
            q.minNetSurplus,
            q.keeperRecipient,
            q.surplusRecipient,
            q.validUntil,
            q.policyHash,
            q.quoteNonce
        );
        return keccak256(bytes.concat(a, b));
    }
}

/// @notice Pause scopes (PRD SEC08). Market scopes are keccak256(abi.encode(SCOPE_KIND, marketKey)).
library Scopes {
    bytes32 internal constant GLOBAL_RESERVATIONS = keccak256("nectar.scope.reservations");
    bytes32 internal constant GLOBAL_EXECUTION = keccak256("nectar.scope.execution");

    function marketReservations(bytes32 marketKey) internal pure returns (bytes32) {
        return keccak256(abi.encode(GLOBAL_RESERVATIONS, marketKey));
    }

    function marketExecution(bytes32 marketKey) internal pure returns (bytes32) {
        return keccak256(abi.encode(GLOBAL_EXECUTION, marketKey));
    }
}
