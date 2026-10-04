import { defineChain, type Address, type Chain, type Hex } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { manifests as generated } from "./manifests";

export interface Deployment {
  chainId: number;
  startBlock: number;
  deployer: Address;
  usdc: Address;
  tsla: Address;
  aapl: Address;
  nvda: Address;
  oracleTsla: Address;
  oracleAapl: Address;
  oracleNvda: Address;
  morpho: Address;
  registry: Address;
  vault: Address;
  executor: Address;
  positionFactory: Address;
  marketTsla: Hex;
  marketAapl: Hex;
  marketNvda: Hex;
}

export const anvilLocal = defineChain({
  id: 31337,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

export type NetworkSlug = "local" | "arbitrum-sepolia" | "robinhood-testnet";

export interface NetworkInfo {
  slug: NetworkSlug;
  family: "Arbitrum" | "Robinhood Chain" | "Local";
  chain: Chain;
  environment: "testnet" | "local";
  explorer?: string;
  /** Default block span for eth_getLogs pagination. */
  logChunk: bigint;
  deployment?: Deployment;
  status: "live" | "coming-soon" | "local";
  note: string;
}

// Deployment manifests are committed under /deployments once a chain is deployed.
const manifests: Record<number, Deployment | undefined> = { ...(generated as Record<number, Deployment>) };

export function registerDeployment(d: Deployment) {
  manifests[d.chainId] = d;
}

export function networks(): NetworkInfo[] {
  return [
    {
      slug: "arbitrum-sepolia",
      family: "Arbitrum",
      chain: arbitrumSepolia,
      environment: "testnet",
      explorer: "https://sepolia.arbiscan.io",
      logChunk: 200_000n,
      deployment: manifests[421614],
      status: manifests[421614] ? "live" : "coming-soon",
      note: manifests[421614]
        ? "Public demonstration deployment (chain 421614). Mock lending market and mock prices."
        : "Deployment pending: deployer wallet awaiting Arbitrum Sepolia ETH.",
    },
    {
      slug: "robinhood-testnet",
      family: "Robinhood Chain",
      chain: robinhoodTestnet,
      environment: "testnet",
      explorer: "https://explorer.testnet.chain.robinhood.com",
      logChunk: 200_000n,
      deployment: manifests[46630],
      status: manifests[46630] ? "live" : "coming-soon",
      note: manifests[46630]
        ? "Robinhood Chain Testnet deployment (chain 46630). Mock stock tokens and prices."
        : "Coming soon. RPC verified (chain 46630); contracts not yet deployed in this slice.",
    },
    {
      slug: "local",
      family: "Local",
      chain: anvilLocal,
      environment: "local",
      logChunk: 1_000_000n,
      deployment: manifests[31337],
      status: "local",
      note: "Local anvil chain for development and recorded demos.",
    },
  ];
}

export function networkBySlug(slug: string): NetworkInfo | undefined {
  return networks().find((n) => n.slug === slug);
}

export function networkByChainId(id: number): NetworkInfo | undefined {
  return networks().find((n) => n.chain.id === id);
}

export function explorerTx(n: NetworkInfo, hash: string) {
  return n.explorer ? `${n.explorer}/tx/${hash}` : undefined;
}

export function explorerAddress(n: NetworkInfo, addr: string) {
  return n.explorer ? `${n.explorer}/address/${addr}` : undefined;
}
