import { createPublicClient, http, fallback } from "viem";
import { deploymentFor, type Deployment } from "./config";

const clientCache = new Map<number, ReturnType<typeof createPublicClient>>();
const probeCache = new Map<number, { at: number; result: { ok: boolean; block?: string; error?: string } }>();

export function publicClient(chainId: number) {
  const existing = clientCache.get(chainId);
  if (existing) return existing;
  const d = deploymentFor(chainId);
  const rpc = d?.rpc || process.env.ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
  const timeout = chainId === 31337 ? 4_000 : 6_000;
  const client = createPublicClient({
    transport: http(rpc, { timeout, retryCount: 0 }),
  });
  clientCache.set(chainId, client);
  return client;
}

export async function probeRpc(d: Deployment): Promise<{
  ok: boolean;
  block?: string;
  error?: string;
}> {
  const hit = probeCache.get(d.chainId);
  if (hit && Date.now() - hit.at < 15_000) return hit.result;
  try {
    const client = createPublicClient({
      transport: fallback([http(d.rpc, { timeout: 4_000, retryCount: 0 })]),
    });
    const block = (await Promise.race([
      client.getBlockNumber(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("RPC_UNAVAILABLE")), 5_000)),
    ])) as bigint;
    const result = { ok: true, block: block.toString() };
    probeCache.set(d.chainId, { at: Date.now(), result });
    return result;
  } catch (e) {
    const result = { ok: false, error: e instanceof Error ? e.message : "RPC_UNAVAILABLE" };
    probeCache.set(d.chainId, { at: Date.now(), result });
    return result;
  }
}
