import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Address, Hex } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, "backend", ".env") });

export const ANVIL_KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
];

export type Family = "arbitrum" | "robinhood" | "other";

export interface Manifest {
  file: string;
  network: string;
  chainId: number;
  mode?: "local" | "testnet";
  scope: string;
  deployer: Address;
  governance: Address;
  guardian: Address;
  feeRecipient: Address;
  timelockDelaySeconds: number;
  keeperAllowlistEnabled: boolean;
  deploymentBlock: number;
  releaseCommit: string;
  rpcUrl?: string;
  publicRpcUrl?: string;
  contracts: Record<string, Address>;
  codehashes: Record<string, Hex>;
  markets: Record<string, Hex>;
}

export interface NetworkConfig {
  key: string;
  chainId: number;
  name: string;
  family: Family;
  mode: "local" | "testnet";
  rpcUrl: string;
  explorer?: string;
  manifest: Manifest;
  operatorKey?: Hex;
  keeperKey?: Hex;
  makerKey?: Hex;
}

export function familyOf(chainId: number): Family {
  if (chainId === 421614 || chainId === 42161) return "arbitrum";
  if (chainId === 46630 || chainId === 4663) return "robinhood";
  return "other";
}

const EXPLORERS: Record<number, string> = {
  421614: "https://sepolia.arbiscan.io",
  46630: "https://explorer.testnet.chain.robinhood.com",
};

export const deploymentsDir = process.env.DEPLOYMENTS_DIR ?? path.join(repoRoot, "deployments");

export function loadNetworks(): NetworkConfig[] {
  if (!fs.existsSync(deploymentsDir)) return [];
  const enabled = process.env.ENABLED_NETWORKS?.split(",").map((s) => s.trim()).filter(Boolean);
  return fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const manifest = { file: f, ...JSON.parse(fs.readFileSync(path.join(deploymentsDir, f), "utf8")) } as Manifest;
      const key = f.replace(/\.json$/, "");
      const mode = manifest.mode ?? (key.startsWith("local") ? "local" : "testnet");
      const envKey = `RPC_URL_${key.replace(/-/g, "_").toUpperCase()}`;
      const rpcUrl = process.env[envKey] ?? manifest.rpcUrl ?? manifest.publicRpcUrl ?? "http://127.0.0.1:8545";
      const cfg: NetworkConfig = {
        key,
        chainId: manifest.chainId,
        name: manifest.network,
        family: familyOf(manifest.chainId),
        mode,
        rpcUrl,
        explorer: mode === "testnet" ? EXPLORERS[manifest.chainId] : undefined,
        manifest,
      };
      if (mode === "local") {
        cfg.operatorKey = ANVIL_KEYS[0];
        cfg.keeperKey = (process.env.LOCAL_KEEPER_PRIVATE_KEY as Hex) ?? ANVIL_KEYS[1];
        cfg.makerKey = ANVIL_KEYS[2];
      } else {
        cfg.operatorKey = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
        cfg.keeperKey = (process.env.KEEPER_PRIVATE_KEY as Hex | undefined) ?? cfg.operatorKey;
        cfg.makerKey = process.env.MAKER_PRIVATE_KEY as Hex | undefined;
      }
      return cfg;
    })
    .filter((n) => !enabled || enabled.includes(n.key))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: process.env.DATA_DIR ?? path.join(repoRoot, "backend", "data"),
  pollMs: Number(process.env.POLL_MS ?? 1500),
  keeperEnabled: (process.env.KEEPER_ENABLED ?? "true") !== "false",
  priceFeederEnabled: (process.env.PRICE_FEEDER_ENABLED ?? "true") !== "false",
  confirmationsForFinal: Number(process.env.CONFIRMATIONS_FOR_FINAL ?? 3),
};
