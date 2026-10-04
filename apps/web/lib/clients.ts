import { createPublicClient, http, fallback } from "viem";
import { deploymentFor, type Deployment } from "./config";

const clientCache = new Map<number, ReturnType<typeof createPublicClient>>();

export function publicClient(chainId: number) {
  const existing = clientCache.get(chainId);
  if (existing) return existing;
  const d = deploymentFor(chainId);
  const rpc = d?.rpc || process.env.ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
  const client = createPublicClient({
    transport: http(rpc, { timeout: 12_000, retryCount: 1 }),
  });
  clientCache.set(chainId, client);
  return client;
}

export async function probeRpc(d: Deployment): Promise<{
  ok: boolean;
  block?: string;
  error?: string;
}> {
  try {
    const client = createPublicClient({
      transport: fallback([http(d.rpc, { timeout: 8_000, retryCount: 0 })]),
    });
    const block = await client.getBlockNumber();
    return { ok: true, block: block.toString() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "RPC_UNAVAILABLE" };
  }
}
