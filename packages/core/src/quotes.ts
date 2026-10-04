import { type Address, type Hex, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import type { Deployment } from "./networks";

/** EIP-712 Quote struct matching MakerVault.QUOTE_TYPEHASH. */
export interface QuoteInput {
  maker: Address;
  marketKey: Hex;
  policyVersion: number;
  borrower: Address;
  collateralToken: Address;
  collateralAmount: bigint;
  debtToken: Address;
  cashOut: bigint;
  maxDebtRepay: bigint;
  collateralRecipient: Address;
  keeperFee: bigint;
  protocolFee: bigint;
  minNetSurplus: bigint;
  surplusRecipient: Address;
  validUntil: bigint;
  nonce: bigint;
}

export const quoteTypedDataTypes = {
  Quote: [
    { name: "maker", type: "address" },
    { name: "marketKey", type: "bytes32" },
    { name: "policyVersion", type: "uint32" },
    { name: "borrower", type: "address" },
    { name: "collateralToken", type: "address" },
    { name: "collateralAmount", type: "uint256" },
    { name: "debtToken", type: "address" },
    { name: "cashOut", type: "uint256" },
    { name: "maxDebtRepay", type: "uint256" },
    { name: "collateralRecipient", type: "address" },
    { name: "keeperFee", type: "uint256" },
    { name: "protocolFee", type: "uint256" },
    { name: "minNetSurplus", type: "uint256" },
    { name: "surplusRecipient", type: "address" },
    { name: "validUntil", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export function quoteDomain(chainId: number, vault: Address) {
  return {
    name: "Nectar QuoteEscrow",
    version: "1",
    chainId,
    verifyingContract: vault,
  } as const;
}

/** Suggested economics for a liquidation bid from position hints (PRD fixture-style defaults). */
export function suggestedQuoteFromPosition(
  d: Deployment,
  marketKey: Hex,
  policyVersion: number,
  maker: Address,
  collateralToken: Address,
  debtToken: Address,
  collateralAmount: bigint,
  maxDebtRepay: bigint,
  validUntil: bigint,
  nonce: bigint,
  borrower: Address = "0x0000000000000000000000000000000000000000",
): QuoteInput {
  const keeperFee = 50n * 10n ** 6n;
  const protocolFee = 20n * 10n ** 6n;
  const minNetSurplus = 70n * 10n ** 6n;
  const cashOut = maxDebtRepay + keeperFee + protocolFee + minNetSurplus;
  return {
    maker,
    marketKey,
    policyVersion,
    borrower,
    collateralToken,
    collateralAmount,
    debtToken,
    cashOut,
    maxDebtRepay,
    collateralRecipient: maker,
    keeperFee,
    protocolFee,
    minNetSurplus,
    surplusRecipient: maker,
    validUntil,
    nonce,
  };
}

export function quoteToTypedMessage(q: QuoteInput) {
  return {
    maker: q.maker,
    marketKey: q.marketKey,
    policyVersion: q.policyVersion,
    borrower: q.borrower,
    collateralToken: q.collateralToken,
    collateralAmount: q.collateralAmount,
    debtToken: q.debtToken,
    cashOut: q.cashOut,
    maxDebtRepay: q.maxDebtRepay,
    collateralRecipient: q.collateralRecipient,
    keeperFee: q.keeperFee,
    protocolFee: q.protocolFee,
    minNetSurplus: q.minNetSurplus,
    surplusRecipient: q.surplusRecipient,
    validUntil: q.validUntil,
    nonce: q.nonce,
  };
}

/** Mirrors MakerVault.hashQuote for off-chain id preview. */
export function hashQuoteStruct(q: QuoteInput): Hex {
  const typeHash = keccak256(
    new TextEncoder().encode(
      "Quote(address maker,bytes32 marketKey,uint32 policyVersion,address borrower,address collateralToken,uint256 collateralAmount,address debtToken,uint256 cashOut,uint256 maxDebtRepay,address collateralRecipient,uint256 keeperFee,uint256 protocolFee,uint256 minNetSurplus,address surplusRecipient,uint64 validUntil,uint256 nonce)",
    ),
  );
  const a = encodeAbiParameters(parseAbiParameters("bytes32, address, bytes32, uint32, address, address, uint256, address, uint256"), [
    typeHash,
    q.maker,
    q.marketKey,
    q.policyVersion,
    q.borrower,
    q.collateralToken,
    q.collateralAmount,
    q.debtToken,
    q.cashOut,
  ]);
  const b = encodeAbiParameters(
    parseAbiParameters("uint256, address, uint256, uint256, uint256, address, uint64, uint256"),
    [q.maxDebtRepay, q.collateralRecipient, q.keeperFee, q.protocolFee, q.minNetSurplus, q.surplusRecipient, q.validUntil, q.nonce],
  );
  return keccak256(`0x${Buffer.concat([Buffer.from(a.slice(2), "hex"), Buffer.from(b.slice(2), "hex")]).toString("hex")}` as Hex);
}
