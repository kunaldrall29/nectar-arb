import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { arbitrumSepolia } from "viem/chains";

export type DeploymentManifest = {
  chainId: number;
  network: string;
  blockNumber: number;
  marketKey: string;
  contracts: Record<string, string>;
};

const root = resolve(process.cwd(), "../..");

export function loadManifest(): DeploymentManifest | null {
  const path = resolve(root, "deployments/arbitrum-sepolia.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentManifest;
}

export const chain = arbitrumSepolia;

export function getRpcUrl(): string {
  return (
    process.env.ARBITRUM_SEPOLIA_RPC_URL ??
    process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL ??
    "https://sepolia-rollup.arbitrum.io/rpc"
  );
}
