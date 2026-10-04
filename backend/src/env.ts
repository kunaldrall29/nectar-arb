import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EventCache, networkBySlug, type EventCacheSnapshot, type KeeperDecision } from "@nectar/core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const dataDir = process.env.NECTAR_DATA_DIR ?? join(root, "backend", "data");
mkdirSync(dataDir, { recursive: true });

const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function secretKey(): Hex | undefined {
  if (process.env.KEEPER_PRIVATE_KEY) return process.env.KEEPER_PRIVATE_KEY as Hex;
  const f = join(root, ".secrets", "deployer.env");
  if (existsSync(f)) {
    const m = readFileSync(f, "utf8").match(/^PRIVATE_KEY=(0x[0-9a-fA-F]{64})/m);
    if (m) return m[1] as Hex;
  }
  return undefined;
}

export function loadEnv() {
  const slug = process.env.NECTAR_NETWORK ?? "local";
  const net = networkBySlug(slug);
  if (!net) throw new Error(`Unknown NECTAR_NETWORK=${slug}`);
  if (!net.deployment) throw new Error(`No deployment manifest for ${slug} (chain ${net.chain.id}). Run the deploy script first.`);
  const rpc = process.env.RPC_URL ?? net.chain.rpcUrls.default.http[0];
  const transport = http(rpc, { retryCount: 3, retryDelay: 400 });
  const publicClient = createPublicClient({ chain: net.chain, transport }) as PublicClient;
  const key = slug === "local" ? ((process.env.KEEPER_PRIVATE_KEY as Hex) ?? ANVIL_KEY) : secretKey();
  const account = key ? privateKeyToAccount(key) : undefined;
  const wallet = account ? createWalletClient({ chain: net.chain, transport, account }) : undefined;

  const snapPath = join(dataDir, `events-${net.chain.id}.json`);
  const cache = new EventCache(publicClient, net.deployment, {
    chunk: net.logChunk,
    reorgWindow: 20,
    load: () => (existsSync(snapPath) ? (JSON.parse(readFileSync(snapPath, "utf8")) as EventCacheSnapshot) : undefined),
    save: (s) => writeFileSync(snapPath, JSON.stringify(s)),
  });
  return { slug, net, d: net.deployment, rpc, publicClient, wallet, account, cache };
}

export class JobJournal {
  private path: string;
  jobs: KeeperDecision[];
  constructor(chainId: number) {
    this.path = join(dataDir, `jobs-${chainId}.json`);
    this.jobs = existsSync(this.path) ? JSON.parse(readFileSync(this.path, "utf8")) : [];
  }
  record(d: KeeperDecision) {
    const last = [...this.jobs].reverse().find((j) => j.borrower === d.borrower && j.marketKey === d.marketKey);
    // collapse repeated identical refusals; always keep transaction lifecycle transitions
    if (last && !d.txHash && last.code === d.code && last.state === d.state) {
      last.at = d.at;
    } else if (d.txHash) {
      const same = this.jobs.find((j) => j.txHash === d.txHash);
      if (same) Object.assign(same, d);
      else this.jobs.push(d);
    } else {
      this.jobs.push(d);
    }
    this.jobs = this.jobs.slice(-500);
    writeFileSync(this.path, JSON.stringify(this.jobs, null, 1));
  }
  pending() {
    return this.jobs.filter((j) => j.state === "Submitted" && j.txHash);
  }
  reload() {
    if (existsSync(this.path)) this.jobs = JSON.parse(readFileSync(this.path, "utf8"));
  }
}
