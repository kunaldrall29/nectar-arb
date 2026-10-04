export const quoteTypes = {
  Quote: [
    { name: "schemaVersion", type: "uint8" },
    { name: "maker", type: "address" },
    { name: "makerNonce", type: "uint256" },
    { name: "marketKey", type: "bytes32" },
    { name: "adapterVersion", type: "uint16" },
    { name: "borrower", type: "address" },
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
    { name: "validUntil", type: "uint64" },
    { name: "reservationId", type: "uint256" },
    { name: "policyHash", type: "bytes32" },
    { name: "quoteNonce", type: "uint256" },
  ],
} as const;

export const EIP712_NAME = "NectarQuotes";
export const EIP712_VERSION = "1";

export const KEEPER_FEE = 50_000_000n;
export const PROTOCOL_FEE = 20_000_000n;
export const MIN_SURPLUS = 70_000_000n;
