import sepoliaManifest from "../../../deployments/arbitrum-sepolia.json";
import anvilManifest from "../../../deployments/anvil.json";
import robinhoodManifest from "../../../deployments/robinhood-testnet.json";

export type Deployment = {
  network: string;
  chainId: number;
  status: "live" | "awaiting_gas" | "local" | "monitored";
  rpc: string;
  explorer?: string;
  compiler?: { solc: string; optimizer: boolean; runs: number; viaIR: boolean };
  commit?: string;
  deploymentBlock?: number;
  keeperAllowlist?: boolean;
  mockLabeled?: boolean;
  marketKey?: `0x${string}`;
  morphoMarketId?: `0x${string}`;
  policyHash?: `0x${string}`;
  borrower?: `0x${string}`;
  addresses?: Record<string, `0x${string}`>;
  roles?: Record<string, `0x${string}`>;
  bytecodeHashes?: Record<string, `0x${string}`>;
};

export function deployments(): Deployment[] {
  const list: Deployment[] = [];
  const sepolia = sepoliaManifest as Deployment;
  const anvil = anvilManifest as Deployment;
  const rh = robinhoodManifest as Deployment;
  if (sepolia) list.push(sepolia);
  if (rh) list.push(rh);
  if (anvil && !process.env.VERCEL) list.push(anvil);
  return list;
}

export function deploymentFor(chainId: number): Deployment | undefined {
  return deployments().find((d) => d.chainId === chainId);
}
