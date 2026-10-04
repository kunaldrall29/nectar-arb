export const ESCROW_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "beneficiary", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "recipient", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "registerQuote",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "schemaVersion", type: "uint256" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
          { name: "maker", type: "address" },
          { name: "makerNonce", type: "uint256" },
          { name: "marketKey", type: "bytes32" },
          { name: "adapterVersion", type: "uint256" },
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
          { name: "validUntil", type: "uint256" },
          { name: "reservationId", type: "bytes32" },
          { name: "policyHash", type: "bytes32" },
          { name: "quoteNonce", type: "uint256" }
        ]
      },
      { name: "signature", type: "bytes" }
    ],
    outputs: [{ name: "quoteId", type: "bytes32" }]
  },
  {
    type: "function",
    name: "releaseExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "quoteId", type: "bytes32" }],
    outputs: []
  },
  {
    type: "function",
    name: "availableCash",
    stateMutability: "view",
    inputs: [
      { name: "maker", type: "address" },
      { name: "token", type: "address" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "reservedCash",
    stateMutability: "view",
    inputs: [
      { name: "maker", type: "address" },
      { name: "token", type: "address" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "cashBalance",
    stateMutability: "view",
    inputs: [
      { name: "maker", type: "address" },
      { name: "token", type: "address" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "maker", type: "address" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "getQuote",
    stateMutability: "view",
    inputs: [{ name: "quoteId", type: "bytes32" }],
    outputs: [
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "schemaVersion", type: "uint256" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
          { name: "maker", type: "address" },
          { name: "makerNonce", type: "uint256" },
          { name: "marketKey", type: "bytes32" },
          { name: "adapterVersion", type: "uint256" },
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
          { name: "validUntil", type: "uint256" },
          { name: "reservationId", type: "bytes32" },
          { name: "policyHash", type: "bytes32" },
          { name: "quoteNonce", type: "uint256" }
        ]
      },
      { name: "active", type: "bool" },
      { name: "consumed", type: "bool" },
      { name: "released", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }]
  }
] as const;

export const EXECUTOR_ABI = [
  {
    type: "function",
    name: "previewJob",
    stateMutability: "view",
    inputs: [
      {
        name: "job",
        type: "tuple",
        components: [
          { name: "marketKey", type: "bytes32" },
          { name: "positionId", type: "bytes32" },
          { name: "quoteId", type: "bytes32" },
          { name: "borrower", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "collateralAmount", type: "uint256" },
          { name: "debtToken", type: "address" },
          { name: "maxDebtRepay", type: "uint256" },
          { name: "collateralRecipient", type: "address" },
          { name: "keeperRecipient", type: "address" },
          { name: "surplusRecipient", type: "address" },
          { name: "keeperCompensation", type: "uint256" },
          { name: "protocolFee", type: "uint256" },
          { name: "minNetSurplus", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      }
    ],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "reason", type: "string" }
    ]
  },
  {
    type: "function",
    name: "executeJob",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "job",
        type: "tuple",
        components: [
          { name: "marketKey", type: "bytes32" },
          { name: "positionId", type: "bytes32" },
          { name: "quoteId", type: "bytes32" },
          { name: "borrower", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "collateralAmount", type: "uint256" },
          { name: "debtToken", type: "address" },
          { name: "maxDebtRepay", type: "uint256" },
          { name: "collateralRecipient", type: "address" },
          { name: "keeperRecipient", type: "address" },
          { name: "surplusRecipient", type: "address" },
          { name: "keeperCompensation", type: "uint256" },
          { name: "protocolFee", type: "uint256" },
          { name: "minNetSurplus", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      }
    ],
    outputs: [{ name: "jobId", type: "bytes32" }]
  },
  {
    type: "event",
    name: "LiquidationSettled",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "quoteId", type: "bytes32", indexed: true },
      { name: "positionId", type: "bytes32", indexed: true },
      { name: "debtRepaid", type: "uint256", indexed: false },
      { name: "collateralSeized", type: "uint256", indexed: false },
      { name: "keeperCompensation", type: "uint256", indexed: false },
      { name: "protocolFee", type: "uint256", indexed: false },
      { name: "surplus", type: "uint256", indexed: false }
    ]
  }
] as const;

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketKey", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "marketKey", type: "bytes32" },
          { name: "chainId", type: "uint256" },
          { name: "lendingProtocol", type: "address" },
          { name: "marketId", type: "bytes32" },
          { name: "debtToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "adapter", type: "address" },
          { name: "adapterVersion", type: "uint256" },
          { name: "policyHash", type: "bytes32" },
          { name: "active", type: "bool" },
          { name: "label", type: "string" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "marketCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "marketKeys",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "isActive",
    stateMutability: "view",
    inputs: [{ name: "marketKey", type: "bytes32" }],
    outputs: [{ type: "bool" }]
  }
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }]
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;

export const LENDING_ABI = [
  {
    type: "function",
    name: "openPosition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "borrower", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "debtToken", type: "address" },
      { name: "collateralAmount", type: "uint256" },
      { name: "debtAmount", type: "uint256" },
      { name: "liquidatable", type: "bool" }
    ],
    outputs: [{ name: "positionId", type: "bytes32" }]
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{ name: "positionId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "borrower", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "debtToken", type: "address" },
          { name: "collateralAmount", type: "uint256" },
          { name: "debtAmount", type: "uint256" },
          { name: "liquidatable", type: "bool" }
        ]
      }
    ]
  }
] as const;

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
    { name: "quoteNonce", type: "uint256" }
  ]
} as const;
