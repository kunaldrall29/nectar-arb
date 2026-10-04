import manifest from "../../../../deployments/arbitrum-sepolia.json";

export const deployment = manifest as {
  chainId: number;
  network: string;
  blockNumber: number | string;
  marketKey: string;
  contracts: Record<string, string>;
};

export const escrowAbi = [
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
          { name: "quoteNonce", type: "bytes32" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;
