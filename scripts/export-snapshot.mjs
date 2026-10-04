#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8787";

async function fetchJson(p) {
  const res = await fetch(`${backendUrl}${p}`);
  if (!res.ok) throw new Error(`${p} ${res.status}`);
  return res.json();
}

async function main() {
  const snapshot = {
    exportedAt: new Date().toISOString(),
    environment: "TESTNET",
    source: backendUrl,
    overview: await fetchJson("/api/overview").catch(() => null),
    markets: (await fetchJson("/api/markets").catch(() => ({ markets: [] }))).markets,
    quotes: (await fetchJson("/api/quotes").catch(() => ({ quotes: [] }))).quotes,
    cashAccounts: (await fetchJson("/api/cash-accounts").catch(() => ({ accounts: [] }))).accounts,
    executions: (await fetchJson("/api/executions").catch(() => ({ executions: [] }))).executions,
    analytics: await fetchJson("/api/analytics").catch(() => null),
    networks: await fetchJson("/api/networks").catch(() => []),
  };
  const out = path.join(root, "web/src/generated/snapshot.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.warn("snapshot skipped:", e.message);
  const fallback = {
    exportedAt: new Date().toISOString(),
    environment: "TESTNET",
    source: "bundled-empty",
    overview: { environment: "TESTNET", markets: 0, activeQuotes: 0, executions: 0 },
    markets: [],
    quotes: [],
    cashAccounts: [],
    executions: [],
    analytics: { label: "testnet_measured", executionCount: 0 },
    networks: [],
  };
  const out = path.join(root, "web/src/generated/snapshot.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(fallback, null, 2) + "\n");
});
