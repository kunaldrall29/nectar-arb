export * from "./abi";
export * from "./quote";

export const NETWORKS = {
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    shortName: "Arbitrum",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
    environment: "public-testnet",
  },
  robinhoodTestnet: {
    chainId: 46630,
    name: "Robinhood Chain Testnet",
    shortName: "Robinhood Chain",
    rpc: "",
    explorer: "",
    environment: "public-testnet",
  },
  anvil: {
    chainId: 31337,
    name: "Local Anvil",
    shortName: "Anvil",
    rpc: "http://127.0.0.1:8545",
    explorer: "",
    environment: "local-rehearsal",
  },
} as const;
