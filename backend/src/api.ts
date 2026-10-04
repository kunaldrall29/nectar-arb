/**
 * Nectar read API (PRD Section 14). Versioned JSON; amounts are decimal strings in base units; every
 * response carries chainId, sourceBlock and observedAt so clients can show freshness.
 *
 *   pnpm api            # http://localhost:8787/v1/...
 */
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import type { Address, Hex } from "viem";
import {
  computeAnalytics,
  nectarExecutorAbi,
  networks,
  readChainState,
  readLiquidity,
  receiptsToCsv,
  REFUSAL_CODES,
  REFUSAL_TEXT,
  type ChainState,
} from "@nectar/core";
import { JobJournal, loadEnv } from "./env";

export function createApi() {
  const env = loadEnv();
  const journal = new JobJournal(env.d.chainId);
  let cached: { at: number; state?: ChainState; error?: string; pending?: Promise<ChainState> } = { at: 0 };

  async function state(): Promise<ChainState> {
    if (cached.state && Date.now() - cached.at < 2000) return cached.state;
    if (!cached.pending) {
      cached.pending = readChainState(env.publicClient, env.d, env.cache)
        .then((s) => {
          cached = { at: Date.now(), state: s };
          return s;
        })
        .catch((e) => {
          cached.pending = undefined;
          if (cached.state) return cached.state; // stale but labeled via observedAt
          throw e;
        });
    }
    return cached.pending;
  }

  const meta = (s: ChainState) => ({ chainId: s.chainId, sourceBlock: s.sourceBlock, observedAt: s.observedAt, stale: Date.now() - s.observedAt > 15_000 });
  const app = express();
  app.use(cors());
  app.use(express.json());

  const wrap =
    (fn: (req: express.Request, res: express.Response) => Promise<unknown>) => (req: express.Request, res: express.Response) =>
      fn(req, res).catch((e) => res.status(503).json({ error: "RPC_UNAVAILABLE", message: REFUSAL_TEXT.RPC_UNAVAILABLE, detail: String(e?.message ?? e).slice(0, 300) }));

  app.get("/v1/health", wrap(async (_req, res) => {
    const s = await state();
    res.json({ ok: true, ...meta(s), indexer: { lastBlock: env.cache.snapshot.lastBlock, logs: env.cache.snapshot.logs.length, lastError: env.cache.lastError } });
  }));

  app.get("/v1/networks", (_req, res) => {
    res.json({
      networks: networks().map((n) => ({
        slug: n.slug, family: n.family, chainId: n.chain.id, name: n.chain.name, environment: n.environment,
        status: n.status, note: n.note, explorer: n.explorer, deployment: n.deployment ?? null,
      })),
      active: env.slug,
    });
  });

  app.get("/v1/markets", wrap(async (_req, res) => {
    const s = await state();
    res.json({ ...meta(s), markets: s.markets });
  }));

  app.get("/v1/markets/:marketKey", wrap(async (req, res) => {
    const s = await state();
    const m = s.markets.find((x) => x.marketKey.toLowerCase() === String(req.params.marketKey).toLowerCase());
    if (!m) return res.status(404).json({ error: "UNSUPPORTED_MARKET", message: REFUSAL_TEXT.UNSUPPORTED_MARKET });
    res.json({
      ...meta(s), market: m,
      positions: s.positions.filter((p) => p.marketKey === m.marketKey),
      quotes: s.quotes.filter((q) => q.marketKey === m.marketKey),
      routes: [{ type: "maker-quote", adapter: "nectar.adapter.minimorpho.v1", active: m.activeQuotes }],
    });
  }));

  app.get("/v1/positions", wrap(async (req, res) => {
    const s = await state();
    const status = req.query.status as string | undefined;
    res.json({ ...meta(s), positions: status ? s.positions.filter((p) => p.status === status) : s.positions });
  }));

  app.get("/v1/accounts/:wallet/liquidity", wrap(async (req, res) => {
    const s = await state();
    const w = req.params.wallet as Address;
    const l = await readLiquidity(env.publicClient, env.d, w);
    res.json({ ...meta(s), ...l, quotes: s.quotes.filter((q) => q.maker.toLowerCase() === w.toLowerCase()) });
  }));

  app.get("/v1/quotes", wrap(async (req, res) => {
    const s = await state();
    let q = s.quotes;
    if (req.query.state) q = q.filter((x) => x.state === req.query.state);
    if (req.query.maker) q = q.filter((x) => x.maker.toLowerCase() === String(req.query.maker).toLowerCase());
    res.json({ ...meta(s), quotes: q });
  }));

  app.get("/v1/quotes/:quoteId", wrap(async (req, res) => {
    const s = await state();
    const q = s.quotes.find((x) => x.quoteId.toLowerCase() === String(req.params.quoteId).toLowerCase());
    if (!q) return res.status(404).json({ error: "QUOTE_NOT_FUNDED", message: REFUSAL_TEXT.QUOTE_NOT_FUNDED });
    res.json({ ...meta(s), quote: q });
  }));

  app.get("/v1/receipts", wrap(async (req, res) => {
    const s = await state();
    if (req.query.format === "csv") {
      res.setHeader("content-type", "text/csv");
      res.setHeader("content-disposition", `attachment; filename="nectar-receipts-${s.chainId}.csv"`);
      return res.send(receiptsToCsv(s));
    }
    res.json({ ...meta(s), receipts: s.receipts });
  }));

  app.get("/v1/jobs", wrap(async (_req, res) => {
    const s = await state();
    journal.reload();
    res.json({ ...meta(s), jobs: [...journal.jobs].reverse() });
  }));

  app.post("/v1/jobs/preview", wrap(async (req, res) => {
    const { quoteId, borrower, keeper } = req.body ?? {};
    if (!quoteId || !borrower) return res.status(400).json({ error: "quoteId and borrower are required" });
    const block = await env.publicClient.getBlock();
    const [code, repay, surplus] = await env.publicClient.readContract({
      address: env.d.executor, abi: nectarExecutorAbi, functionName: "previewJob",
      args: [{ quoteId: quoteId as Hex, borrower: borrower as Address, deadline: block.timestamp + 120n }, (keeper ?? env.account?.address ?? borrower) as Address],
    });
    const c = REFUSAL_CODES[Number(code)];
    res.json({ chainId: env.d.chainId, sourceBlock: Number(block.number), code: c, reason: REFUSAL_TEXT[c], expectedRepay: repay.toString(), expectedSurplus: surplus.toString(), binding: false });
  }));

  app.get("/v1/analytics", wrap(async (_req, res) => {
    const s = await state();
    res.json(computeAnalytics(s, [env.d.deployer]));
  }));

  return { app, env };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { app, env } = createApi();
  const port = Number(process.env.PORT ?? 8787);
  app.listen(port, () => console.log(`Nectar API on http://localhost:${port}/v1 (${env.net.chain.name})`));
}
