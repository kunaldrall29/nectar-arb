// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FundedQuote} from "./interfaces/INectarTypes.sol";

library QuoteEIP712 {
    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "FundedQuote(uint8 schemaVersion,uint256 chainId,address verifyingContract,address maker,uint256 makerNonce,bytes32 marketKey,uint8 adapterVersion,bytes32 positionKey,address collateralToken,uint256 collateralAmount,address debtToken,uint256 cashOut,uint256 maxDebtRepay,address collateralRecipient,uint256 keeperCompensation,uint256 protocolFee,uint256 minNetSurplus,address keeperRecipient,address surplusRecipient,uint64 validUntil,uint256 reservationId,bytes32 policyHash,uint256 quoteNonce)"
    );

    function structHash(FundedQuote calldata q) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                q.schemaVersion,
                q.chainId,
                q.verifyingContract,
                q.maker,
                q.makerNonce,
                q.marketKey,
                q.adapterVersion,
                q.positionKey,
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
