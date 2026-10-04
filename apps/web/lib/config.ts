import { readFileSync, existsSync } from "fs";
import path from "path";

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

const ROOT = path.resolve(process.cwd(), process.cwd().endsWith("apps/web") ? "../.." : ".");

function loadJson(rel: string): Deployment | null {
  const p = path.join(ROOT, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Deployment;
}

export function deployments(): Deployment[] {
  const list: Deployment[] = [];
  const sepolia = loadJson("deployments/arbitrum-sepolia.json");
  const anvil = loadJson("deployments/anvil.json");
  const rh = loadJson("deployments/robinhood-testnet.json");
  if (sepolia) list.push(sepolia);
  else {
    list.push({
      network: "arbitrum-sepolia",
      chainId: 421614,
      status: "awaiting_gas",
      rpc: process.env.ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
      explorer: "https://sepolia.arbiscan.io",
      mockLabeled: true,
      keeperAllowlist: true,
      roles: {
        deployer: "0xB1A974969D7e81E71573cBdB3f6d318601d64014",
        keeper: "0x123a06CBd1125973b5E0Cecaf0D9B1EF574835D0",
        maker: "0x628298b2fb130fa9F4D714177858D9a0505c4E9d",
      },
    });
  }
  if (rh) list.push(rh);
  else {
    list.push({
      network: "robinhood-testnet",
      chainId: 46630,
      status: "monitored",
      rpc: process.env.ROBINHOOD_TESTNET_RPC || "https://46630.rpc.thirdweb.com",
      mockLabeled: true,
    });
  }
  if (anvil && !process.env.VERCEL) list.push(anvil);
  return list;
}

export function deploymentFor(chainId: number): Deployment | undefined {
  return deployments().find((d) => d.chainId === chainId);
}
