/** Standalone canonical event indexer: `pnpm indexer`. Persists to backend/data/events-<chainId>.json. */
import { loadEnv } from "./env";

const env = loadEnv();
const POLL = Number(process.env.POLL_MS ?? 3000);
console.log(`Nectar indexer · ${env.net.chain.name} (${env.d.chainId}) from block ${env.d.startBlock}`);
let last = -1;
for (;;) {
  try {
    await env.cache.sync();
    const s = env.cache.snapshot;
    if (s.lastBlock !== last) {
      const counts: Record<string, number> = {};
      for (const l of s.logs) counts[l.eventName] = (counts[l.eventName] ?? 0) + 1;
      console.log(`block ${s.lastBlock} · ${s.logs.length} events`, JSON.stringify(counts));
      last = s.lastBlock;
    }
  } catch (e) {
    console.log("RPC_UNAVAILABLE", (e as Error).message?.slice(0, 200));
  }
  await new Promise((r) => setTimeout(r, POLL));
}
