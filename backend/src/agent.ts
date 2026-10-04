/**
 * Nectar keeper agent.
 *
 *   pnpm agent                                  # local anvil
 *   NECTAR_NETWORK=arbitrum-sepolia pnpm agent  # public testnet (uses KEEPER_PRIVATE_KEY or .secrets/deployer.env)
 *
 * Every POLL_MS it: syncs the canonical event index, reads market/position/quote state at one block,
 * evaluates each liquidatable position against all covering funded quotes with previewJob, picks the
 * best eligible route, simulates the full executeJob via eth_call, submits it, and reconciles the receipt.
 * Refusals are explained with PRD failure codes and journaled to backend/data/jobs-<chainId>.json.
 * On restart it first reconciles any broadcast-but-unconfirmed transaction instead of resubmitting.
 */
import { fileURLToPath } from "node:url";
import { formatUnitsExact, keeperTick, shortAddr } from "@nectar/core";
import { JobJournal, loadEnv } from "./env";

const POLL_MS = Number(process.env.POLL_MS ?? 4000);
const DRY_RUN = process.env.DRY_RUN === "1";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export async function runAgent(signal?: AbortSignal) {
  const env = loadEnv();
  if (!env.wallet || !env.account) {
    throw new Error("No keeper key. Set KEEPER_PRIVATE_KEY (or create .secrets/deployer.env) to run the agent.");
  }
  const journal = new JobJournal(env.d.chainId);
  const ts = () => c.dim(new Date().toISOString().slice(11, 19));
  console.log(c.bold(c.amber("\n  Nectar keeper agent")));
  console.log(`  network   ${env.net.chain.name} (${env.d.chainId})  ${env.rpc}`);
  console.log(`  keeper    ${env.account.address}`);
  console.log(`  executor  ${env.d.executor}`);
  console.log(`  mode      ${DRY_RUN ? "dry-run (simulate only)" : "live"}  poll ${POLL_MS}ms\n`);

  // T21: recover broadcast transactions before doing anything else
  for (const j of journal.pending()) {
    const r = await env.publicClient.getTransactionReceipt({ hash: j.txHash! }).catch(() => undefined);
    if (r) {
      journal.record({ ...j, state: r.status === "success" ? "Included" : "Reverted", blockNumber: Number(r.blockNumber), at: Date.now() });
      console.log(`${ts()} recovered ${j.txHash} → ${r.status}`);
    } else {
      console.log(`${ts()} pending ${j.txHash} still unconfirmed; tracking, not resubmitting`);
    }
  }

  let lastSummary = "";
  while (!signal?.aborted) {
    try {
      const res = await keeperTick(env.publicClient, env.wallet, env.d, env.cache, {
        dryRun: DRY_RUN,
        releaseExpired: true,
        pokeStaleOraclesAfter: 3 * 24 * 3600,
        onSubmitted: (d) => journal.record(d),
        log: (m) => {
          const color = m.startsWith("[included]") ? c.green : m.startsWith("[refuse]") ? c.red : m.startsWith("[skip]") ? c.dim : (x: string) => x;
          console.log(`${ts()} ${color(m)}`);
        },
      });
      for (const d of res.decisions) journal.record(d);
      const usdc = res.state.vault.cashToken;
      const liq = res.state.positions.filter((p) => p.status === "liquidatable").length;
      const risk = res.state.positions.filter((p) => p.status === "at-risk").length;
      const active = res.state.quotes.filter((q) => q.state === "Active").length;
      const summary = `block ${res.sourceBlock} · ${res.state.positions.length} positions (${liq} liquidatable, ${risk} at-risk) · ${active} active quotes · funded ${formatUnitsExact(res.state.vault.fundedCash, usdc.decimals, 2)} ${usdc.symbol}`;
      if (summary.replace(/block \d+ · /, "") !== lastSummary.replace(/block \d+ · /, "")) {
        console.log(`${ts()} ${summary}`);
        lastSummary = summary;
      }
      for (const d of res.decisions.filter((x) => x.state === "Included")) {
        console.log(
          `${ts()} ${c.green("✓ receipt")} ${d.label} borrower ${shortAddr(d.borrower)} repaid ≈ ${formatUnitsExact(d.expectedRepay ?? "0", usdc.decimals, 2)} ${usdc.symbol} tx ${d.txHash}`,
        );
      }
    } catch (e) {
      console.log(`${ts()} ${c.red("RPC_UNAVAILABLE")} ${(e as Error).message?.slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAgent().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
