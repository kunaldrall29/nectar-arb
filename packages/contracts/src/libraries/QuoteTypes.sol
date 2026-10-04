// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct FundedQuote {
    uint256 schemaVersion;
    uint256 chainId;
    address verifyingContract;
    address maker;
    uint256 makerNonce;
    bytes32 marketKey;
    uint256 adapterVersion;
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
    uint256 validUntil;
    bytes32 reservationId;
    bytes32 policyHash;
    bytes32 quoteNonce;
}

struct ExecutionJob {
    bytes32 marketKey;
    address borrower;
    uint256 collateralAmount;
    uint256 maxDebtRepay;
    bytes32 reservationId;
    uint256 deadline;
}

library QuoteTypes {
    bytes32 internal constant FUNDED_QUOTE_TYPEHASH = keccak256(
        "FundedQuote(uint256 schemaVersion,uint256 chainId,address verifyingContract,address maker,uint256 makerNonce,bytes32 marketKey,uint256 adapterVersion,address borrower,address collateralToken,uint256 collateralAmount,address debtToken,uint256 cashOut,uint256 maxDebtRepay,address collateralRecipient,uint256 keeperCompensation,uint256 protocolFee,uint256 minNetSurplus,address keeperRecipient,address surplusRecipient,uint256 validUntil,bytes32 reservationId,bytes32 policyHash,bytes32 quoteNonce)"
    );

    function hash(FundedQuote memory q) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                FUNDED_QUOTE_TYPEHASH,
                q.schemaVersion,
                q.chainId,
                q.verifyingContract,
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
