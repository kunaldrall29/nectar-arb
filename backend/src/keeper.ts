import {
  encodeFunctionData,
  type Hex,
  parseGwei,
} from "viem";
import { nectarExecutorAbi, quoteRegistryAbi } from "./generated/abis.js";
import type { NetworkConfig } from "./config.js";
import { config } from "./config.js";
import { net, REFUSALS } from "./chain.js";
import { db, json, transitionJob, type JobRow } from "./db.js";
import { eventsByName, indexOnce } from "./indexer.js";
import { log } from "./log.js";

const insertJob = db.prepare(`INSERT OR IGNORE INTO jobs
  (job_id, network, chain_id, quote_id, market_key, borrower, state, created_at, updated_at, history)
  VALUES (@job_id, @network, @chain_id, @quote_id, @market_key, @borrower, @state, @created_at, @updated_at, @history)`);

export async function keeperTick(cfg: NetworkConfig): Promise<void> {
  if (!cfg.keeperKey) return;
  const { client, wallet, cfg: c } = net(cfg);
  const keeperAccount = wallet(cfg.keeperKey).account!;
  const executor = c.manifest.contracts.NectarExecutor;

  const activeQuotes = eventsByName(cfg.key, ["QuoteReserved"]).filter((e) => {
    const consumed = eventsByName(cfg.key, ["QuoteConsumed"]).some((x) => x.a.quoteId === e.a.quoteId);
    const released = eventsByName(cfg.key, ["QuoteReleased"]).some((x) => x.a.quoteId === e.a.quoteId);
    return !consumed && !released && Number(e.a.validUntil) > Math.floor(Date.now() / 1000);
  });

  for (const qe of activeQuotes) {
    const quoteId = qe.a.quoteId as Hex;
    const jobId = (await client.readContract({
      address: executor,
      abi: nectarExecutorAbi,
      functionName: "jobIdFor",
      args: [quoteId],
    })) as Hex;

    const existing = db.prepare("SELECT * FROM jobs WHERE job_id = ?").get(jobId) as JobRow | undefined;
    if (existing && ["Submitted", "Included", "Finalized"].includes(existing.state)) continue;
    if (existing?.state === "Rejected") {
      db.prepare("DELETE FROM jobs WHERE job_id = ?").run(jobId);
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
    const preview = await client.readContract({
      address: executor,
      abi: nectarExecutorAbi,
      functionName: "previewJob",
      args: [quoteId, deadline, keeperAccount.address],
    }) as { reason: number };

    const reason = REFUSALS[preview.reason] ?? "UNKNOWN";
    if (preview.reason !== 0) {
      if (!existing) {
        insertJob.run({
          job_id: jobId,
          network: cfg.key,
          chain_id: cfg.chainId,
          quote_id: quoteId,
          market_key: qe.a.marketKey,
          borrower: qe.a.borrower,
          state: "Rejected",
          created_at: Date.now(),
          updated_at: Date.now(),
          history: json([{ state: "Rejected", at: Date.now(), reason }]),
        });
      }
      continue;
    }

    const now = Date.now();
    if (!existing) {
      insertJob.run({
        job_id: jobId,
        network: cfg.key,
        chain_id: cfg.chainId,
        quote_id: quoteId,
        market_key: qe.a.marketKey,
        borrower: qe.a.borrower,
        state: "Observed",
        created_at: now,
        updated_at: now,
        history: json([{ state: "Observed", at: now }]),
      });
    }

    if (existing?.raw_tx && existing.tx_hash && !existing.replaced_by) {
      const pending = await client.getTransaction({ hash: existing.tx_hash as Hex }).catch(() => null);
      if (pending) {
        transitionJob(jobId, "Submitted", { reason: "recovered pending tx after restart" });
        continue;
      }
    }

    transitionJob(jobId, "Simulated", { simulation: json({ reason, preview }) });

    const w = wallet(cfg.keeperKey);
    const nonce = await client.getTransactionCount({ address: keeperAccount.address });
    try {
      transitionJob(jobId, "Submitting", { keeper: keeperAccount.address, nonce, attempts: (existing?.attempts ?? 0) + 1 });
      const hash = await w.writeContract({
        address: executor,
        abi: nectarExecutorAbi,
        functionName: "executeJob",
        args: [quoteId, deadline],
        gas: 2_500_000n,
        maxFeePerGas: parseGwei("2"),
        maxPriorityFeePerGas: parseGwei("1"),
        nonce,
      });
      transitionJob(jobId, "Submitted", { tx_hash: hash });
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: config.confirmationsForFinal });
      const ok = receipt.status === "success";
      transitionJob(jobId, ok ? "Finalized" : "Reverted", {
        receipt: json(receipt),
        gas_used: receipt.gasUsed.toString(),
        gas_cost_wei: (receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n)).toString(),
        observed_block: Number(receipt.blockNumber),
        reason: ok ? undefined : "execution reverted",
      });
      await indexOnce(cfg);
    } catch (e) {
      const msg = (e as Error).message.split("\n")[0];
      transitionJob(jobId, "Rejected", { reason: msg });
      log.warn(`[keeper:${cfg.key}] ${msg}`);
    }
  }
}

export function startKeeper(networks: NetworkConfig[]) {
  if (!config.keeperEnabled) return;
  const loop = async () => {
    for (const n of networks) {
      try {
        await keeperTick(n);
      } catch (e) {
        log.warn(`[keeper:${n.key}] ${(e as Error).message}`);
      }
    }
  };
  setInterval(loop, config.pollMs * 2);
  void loop();
}

/** Release expired quotes so makers can withdraw reserved cash. */
export async function releaseExpiredQuotes(cfg: NetworkConfig): Promise<void> {
  const { client, wallet } = net(cfg);
  const key = cfg.operatorKey ?? cfg.keeperKey;
  if (!key) return;
  const registry = cfg.manifest.contracts.QuoteRegistry;
  const now = Math.floor(Date.now() / 1000);
  for (const e of eventsByName(cfg.key, ["QuoteReserved"])) {
    if (Number(e.a.validUntil) > now) continue;
    const consumed = eventsByName(cfg.key, ["QuoteConsumed"]).some((x) => x.a.quoteId === e.a.quoteId);
    const released = eventsByName(cfg.key, ["QuoteReleased"]).some((x) => x.a.quoteId === e.a.quoteId);
    if (consumed || released) continue;
    try {
      await wallet(key).writeContract({
        address: registry,
        abi: quoteRegistryAbi,
        functionName: "releaseExpired",
        args: [e.a.quoteId],
      });
    } catch {
      /* idempotent */
    }
  }
}
