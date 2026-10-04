// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Types} from "../Types.sol";

library QuoteLib {
    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "Quote(uint256 schemaVersion,uint256 chainId,address verifyingContract,address maker,uint256 makerNonce,bytes32 marketKey,uint256 adapterVersion,address borrower,bytes32 positionKey,address collateralToken,uint256 collateralAmount,address debtToken,uint256 cashOut,uint256 maxDebtRepay,address collateralRecipient,uint256 keeperCompensation,uint256 protocolFee,uint256 minNetSurplus,address keeperRecipient,address surplusRecipient,uint256 validUntil,bytes32 reservationId,bytes32 policyHash,uint256 quoteNonce)"
    );

    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 internal constant NAME_HASH = keccak256("Nectar");
    bytes32 internal constant VERSION_HASH = keccak256("1");

    function hash(Types.Quote memory q) internal pure returns (bytes32) {
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
                q.borrower,
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

    function domainSeparator(address verifyingContract) internal view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, verifyingContract));
    }

    function digest(address verifyingContract, Types.Quote memory q) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(verifyingContract), hash(q)));
    }

    function quoteId(Types.Quote memory q) internal pure returns (bytes32) {
        return hash(q);
    }

    function positionKey(bytes32 marketKey, address borrower) internal pure returns (bytes32) {
        return keccak256(abi.encode(marketKey, borrower));
    }

    function policyHash(Types.Policy memory p) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                p.version, p.maxQuoteLifetime, p.minPriceFreshness, p.sequencerGrace, p.protocolFeeRecipient, p.ammEnabled
            )
        );
    }
}
