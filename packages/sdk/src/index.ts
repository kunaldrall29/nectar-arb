export const EIP712_NAME = "NectarQuoteEscrow";
export const EIP712_VERSION = "1";
export const DEFAULT_LIFETIME_SECONDS = 30;
export const MAX_LIFETIME_SECONDS = 120;

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

export function quoteDomain(chainId: number, verifyingContract: `0x${string}`) {
  return {
    name: EIP712_NAME,
    version: EIP712_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

export const quoteEscrowAbi = [
  {
    type: "function",
    name: "registerQuote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "q", type: "tuple", components: quoteTypes.Quote.map((item) => ({ name: item.name, type: item.type })) },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "reservationId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "beneficiary", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getQuote",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "quote", type: "tuple", components: quoteTypes.Quote.map((item) => ({ name: item.name, type: item.type })) },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "quoteCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteIdAt",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "accountOf",
    stateMutability: "view",
    inputs: [
      { name: "maker", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [
      { name: "cash", type: "uint256" },
      { name: "reserved", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "liabilities",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "QuoteReserved",
    inputs: [
      { name: "reservationId", type: "uint256", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "borrower", type: "address", indexed: true },
      { name: "marketKey", type: "bytes32", indexed: false },
      { name: "cashOut", type: "uint256", indexed: false },
    ],
  },
] as const;

export const jobComponents = [
  { name: "marketId", type: "bytes32" },
  { name: "borrower", type: "address" },
  { name: "repayAssets", type: "uint256" },
  { name: "route", type: "uint8" },
  { name: "reservationId", type: "uint256" },
  { name: "pool", type: "address" },
  { name: "swapAdapter", type: "address" },
  { name: "minSaleOut", type: "uint256" },
  { name: "keeperRecipient", type: "address" },
  { name: "keeperCompensation", type: "uint256" },
  { name: "protocolFee", type: "uint256" },
  { name: "surplusRecipient", type: "address" },
  { name: "deadline", type: "uint64" },
] as const;

export const executorAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [{ name: "job", type: "tuple", components: jobComponents }],
    outputs: [],
  },
  {
    type: "function",
    name: "selectRoute",
    stateMutability: "pure",
    inputs: [
      { name: "required", type: "uint256" },
      { name: "quoteCashOut", type: "uint256" },
      { name: "quoteLive", type: "bool" },
      { name: "propOut", type: "uint256" },
      { name: "propLive", type: "bool" },
      { name: "externalOut", type: "uint256" },
      { name: "externalLive", type: "bool" },
    ],
    outputs: [
      { name: "route", type: "uint8" },
      { name: "best", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "LiquidationSettled",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "borrower", type: "address", indexed: true },
      { name: "route", type: "uint8", indexed: false },
      { name: "debtRepaid", type: "uint256", indexed: false },
      { name: "collateralAmount", type: "uint256", indexed: false },
      { name: "keeperCompensation", type: "uint256", indexed: false },
      { name: "protocolFee", type: "uint256", indexed: false },
      { name: "surplus", type: "uint256", indexed: false },
      { name: "collateralRecipient", type: "address", indexed: false },
      { name: "keeper", type: "address", indexed: false },
    ],
  },
] as const;

export const morphoAbi = [
  {
    type: "function",
    name: "previewLiquidate",
    stateMutability: "view",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
        ],
      },
      { name: "borrower", type: "address" },
      { name: "repaidShares", type: "uint256" },
    ],
    outputs: [
      { name: "seizedAssets", type: "uint256" },
      { name: "repaidAssets", type: "uint256" },
      { name: "unhealthy", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "officialMorphoDeployment",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const registryAbi = [
  {
    type: "function",
    name: "marketCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "marketIdAt",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "executionPaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "marketId", type: "bytes32" },
          { name: "collateralToken", type: "address" },
          { name: "debtToken", type: "address" },
          { name: "adapter", type: "address" },
          { name: "oracle", type: "address" },
          { name: "morpho", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
          { name: "policyVersion", type: "uint16" },
          { name: "policyHash", type: "bytes32" },
          { name: "morphoMarketId", type: "bytes32" },
          { name: "exists", type: "bool" },
          { name: "paused", type: "bool" },
        ],
      },
    ],
  },
] as const;

export const poolAbi = [
  {
    type: "function",
    name: "previewBid",
    stateMutability: "view",
    inputs: [{ name: "collateralAmount", type: "uint256" }],
    outputs: [
      { name: "debtOut", type: "uint256" },
      { name: "ok", type: "bool" },
    ],
  },
  { type: "function", name: "collateralInventory", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "debtBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "inventoryCap", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maker", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pricingUpdater", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "baseSpreadBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export function keeperSubmitExample() {
  return {
    summary: "Keeper submits one bounded job. Failed gas is paid by the keeper. A firm quote is consumed once.",
    steps: [
      "Read previewLiquidate for the sandbox market and borrower.",
      "If route is Quote, the maker has already registered an EIP-712 quote on QuoteEscrow.",
      "Call NectarExecutor.execute with route 1 (quote), 2 (PropAMM), or 3 (external).",
      "Persist the transaction hash before waiting for the receipt. On restart, wait for that hash instead of sending another transaction.",
    ],
  };
}
