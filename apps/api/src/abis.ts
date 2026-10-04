export const escrowAbi = [
  {
    type: "event",
    name: "CashDeposited",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "from", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "CashWithdrawn",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "to", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "QuoteReserved",
    inputs: [
      { name: "reservationId", type: "bytes32", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "validUntil", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "QuoteConsumed",
    inputs: [
      { name: "reservationId", type: "bytes32", indexed: true },
      { name: "maker", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "QuoteReleased",
    inputs: [
      { name: "reservationId", type: "bytes32", indexed: true },
      { name: "maker", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "balances",
    stateMutability: "view",
    inputs: [{ name: "maker", type: "address" }, { name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "reserved",
    stateMutability: "view",
    inputs: [{ name: "maker", type: "address" }, { name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "maker", type: "address" }, { name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const executorAbi = [
  {
    type: "event",
    name: "LiquidationSettled",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "marketKey", type: "bytes32", indexed: true },
      { name: "reservationId", type: "bytes32", indexed: true },
      { name: "borrower", type: "address", indexed: false },
      { name: "debtRepaid", type: "uint256", indexed: false },
      { name: "collateralAmount", type: "uint256", indexed: false },
      { name: "keeperCompensation", type: "uint256", indexed: false },
      { name: "protocolFee", type: "uint256", indexed: false },
      { name: "surplus", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "previewJob",
    stateMutability: "view",
    inputs: [
      {
        name: "route",
        type: "tuple",
        components: [
          { name: "marketKey", type: "bytes32" },
          { name: "borrower", type: "address" },
          { name: "collateralAmount", type: "uint256" },
          { name: "maxDebtRepay", type: "uint256" },
          { name: "reservationId", type: "bytes32" },
          { name: "deadline", type: "uint256" },
          { name: "collateralRecipient", type: "address" },
          { name: "keeperCompensation", type: "uint256" },
          { name: "protocolFee", type: "uint256" },
          { name: "keeperRecipient", type: "address" },
          { name: "surplusRecipient", type: "address" },
          { name: "minNetSurplus", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "ok", type: "bool" }, { name: "reason", type: "string" }],
  },
] as const;

export const registryAbi = [
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketKey", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "chainId", type: "uint256" },
          { name: "lendingMarket", type: "address" },
          { name: "debtToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "adapter", type: "address" },
          { name: "adapterVersion", type: "uint256" },
          { name: "policyHash", type: "bytes32" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
] as const;
