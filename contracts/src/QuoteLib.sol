// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice EIP-712 single-fill purchase quote. Integer amounts are token base units.
library QuoteLib {
    struct Quote {
        uint8 schemaVersion;
        address maker;
        uint256 makerNonce;
        bytes32 marketKey;
        uint16 adapterVersion;
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
        uint256 reservationId;
        bytes32 policyHash;
        uint256 quoteNonce;
    }

    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "Quote(uint8 schemaVersion,address maker,uint256 makerNonce,bytes32 marketKey,uint16 adapterVersion,address borrower,address collateralToken,uint256 collateralAmount,address debtToken,uint256 cashOut,uint256 maxDebtRepay,address collateralRecipient,uint256 keeperCompensation,uint256 protocolFee,uint256 minNetSurplus,address keeperRecipient,address surplusRecipient,uint64 validUntil,uint256 reservationId,bytes32 policyHash,uint256 quoteNonce)"
    );

    function hash(Quote memory q) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
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
                q.cashOut,
                q.maxDebtRepay,
                q.collateralRecipient,
                q.keeperCompensation,
                q.protocolFee,
                q.minNetSurplus,
                q.keeperRecipient,
                q.surplusRecipient,
                q.validUntil,
                q.reservationId,
                q.policyHash,
                q.quoteNonce
            )
        );
    }
}
