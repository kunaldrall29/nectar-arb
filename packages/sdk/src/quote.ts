import { type Hex, type TypedDataDomain, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

export const QUOTE_TYPES = {
  Quote: [
    { name: "schemaVersion", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "maker", type: "address" },
    { name: "makerNonce", type: "uint256" },
    { name: "marketKey", type: "bytes32" },
    { name: "adapterVersion", type: "uint256" },
    { name: "borrower", type: "address" },
    { name: "positionKey", type: "bytes32" },
    { name: "collateralToken", type: "address" },
    { name: "collateralAmount", type: "uint256" },
    { name: "debtToken", type: "address" },
    { name: "cashOut", type: "uint256" },
    { name: "maxDebtRepay", type: "uint256" },
    { name: "collateralRecipient", type: "address" },
    { name: "keeperCompensation", type: "uint256" },
    { name: "protocolFee", type: "uint256" },
    { name: "minNetSurplus", type: "uint256" },
    { name: "keeperRecipient", type: "address" },
    { name: "surplusRecipient", type: "address" },
    { name: "validUntil", type: "uint256" },
    { name: "reservationId", type: "bytes32" },
    { name: "policyHash", type: "bytes32" },
    { name: "quoteNonce", type: "uint256" },
  ],
} as const;

export type NectarQuote = {
  schemaVersion: bigint;
  chainId: bigint;
  verifyingContract: `0x${string}`;
  maker: `0x${string}`;
  makerNonce: bigint;
  marketKey: Hex;
  adapterVersion: bigint;
  borrower: `0x${string}`;
  positionKey: Hex;
  collateralToken: `0x${string}`;
  collateralAmount: bigint;
  debtToken: `0x${string}`;
  cashOut: bigint;
  maxDebtRepay: bigint;
  collateralRecipient: `0x${string}`;
  keeperCompensation: bigint;
  protocolFee: bigint;
  minNetSurplus: bigint;
  keeperRecipient: `0x${string}`;
  surplusRecipient: `0x${string}`;
  validUntil: bigint;
  reservationId: Hex;
  policyHash: Hex;
  quoteNonce: bigint;
};

export function quoteDomain(chainId: number, verifyingContract: `0x${string}`): TypedDataDomain {
  return {
    name: "Nectar",
    version: "1",
    chainId,
    verifyingContract,
  };
}

export function positionKey(marketKey: Hex, borrower: `0x${string}`): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, address"), [marketKey, borrower]),
  );
}

export function serializeQuote(q: NectarQuote) {
  return {
    schemaVersion: q.schemaVersion.toString(),
    chainId: q.chainId.toString(),
    verifyingContract: q.verifyingContract,
    maker: q.maker,
    makerNonce: q.makerNonce.toString(),
    marketKey: q.marketKey,
    adapterVersion: q.adapterVersion.toString(),
    borrower: q.borrower,
    positionKey: q.positionKey,
    collateralToken: q.collateralToken,
    collateralAmount: q.collateralAmount.toString(),
    debtToken: q.debtToken,
    cashOut: q.cashOut.toString(),
    maxDebtRepay: q.maxDebtRepay.toString(),
    collateralRecipient: q.collateralRecipient,
    keeperCompensation: q.keeperCompensation.toString(),
    protocolFee: q.protocolFee.toString(),
    minNetSurplus: q.minNetSurplus.toString(),
    keeperRecipient: q.keeperRecipient,
    surplusRecipient: q.surplusRecipient,
    validUntil: q.validUntil.toString(),
    reservationId: q.reservationId,
    policyHash: q.policyHash,
    quoteNonce: q.quoteNonce.toString(),
  };
}

export function deserializeQuote(raw: Record<string, string>): NectarQuote {
  return {
    schemaVersion: BigInt(raw.schemaVersion),
    chainId: BigInt(raw.chainId),
    verifyingContract: raw.verifyingContract as `0x${string}`,
    maker: raw.maker as `0x${string}`,
    makerNonce: BigInt(raw.makerNonce),
    marketKey: raw.marketKey as Hex,
    adapterVersion: BigInt(raw.adapterVersion),
    borrower: raw.borrower as `0x${string}`,
    positionKey: raw.positionKey as Hex,
    collateralToken: raw.collateralToken as `0x${string}`,
    collateralAmount: BigInt(raw.collateralAmount),
    debtToken: raw.debtToken as `0x${string}`,
    cashOut: BigInt(raw.cashOut),
    maxDebtRepay: BigInt(raw.maxDebtRepay),
    collateralRecipient: raw.collateralRecipient as `0x${string}`,
    keeperCompensation: BigInt(raw.keeperCompensation),
    protocolFee: BigInt(raw.protocolFee),
    minNetSurplus: BigInt(raw.minNetSurplus),
    keeperRecipient: raw.keeperRecipient as `0x${string}`,
    surplusRecipient: raw.surplusRecipient as `0x${string}`,
    validUntil: BigInt(raw.validUntil),
    reservationId: raw.reservationId as Hex,
    policyHash: raw.policyHash as Hex,
    quoteNonce: BigInt(raw.quoteNonce),
  };
}
