import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadNetworks, config, familyOf, type Family } from "./config.js";
import { indexerStatus, indexOnce } from "./indexer.js";
import {
  analyticsSummary,
  listCashAccounts,
  listExecutions,
  listMarkets,
  listQuotes,
} from "./queries.js";
import { db } from "./db.js";

export async function buildServer() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, ts: Date.now() }));

  app.get("/api/networks", async () => {
    return loadNetworks().map((n) => ({
      key: n.key,
      chainId: n.chainId,
      name: n.name,
      family: n.family,
      mode: n.mode,
      rpcUrl: n.mode === "local" ? n.rpcUrl : undefined,
      explorer: n.explorer,
      scope: n.manifest.scope,
      contracts: n.manifest.contracts,
      indexer: indexerStatus.get(n.key) ?? null,
    }));
  });

  app.get<{ Querystring: { network?: string; family?: Family } }>("/api/markets", async (req) => {
    let markets = listMarkets(req.query.network);
    if (req.query.family) markets = markets.filter((m) => m.family === req.query.family);
    return { markets, stale: false };
  });

  app.get<{ Querystring: { network?: string; status?: string; family?: Family } }>("/api/quotes", async (req) => {
    let quotes = listQuotes(req.query.network, req.query.status);
    if (req.query.family) quotes = quotes.filter((q) => q.family === req.query.family);
    return { quotes };
  });

  app.get<{ Querystring: { network?: string; maker?: string } }>("/api/cash-accounts", async (req) => {
    let accounts = listCashAccounts(req.query.network);
    if (req.query.maker) accounts = accounts.filter((a) => a.maker.toLowerCase() === req.query.maker!.toLowerCase());
    return { accounts };
  });

  app.get<{ Querystring: { network?: string; family?: Family } }>("/api/executions", async (req) => {
    let executions = listExecutions(req.query.network);
    if (req.query.family) executions = executions.filter((e) => e.family === req.query.family);
    return { executions };
  });

  app.get<{ Querystring: { network?: string } }>("/api/analytics", async (req) => {
    return analyticsSummary(req.query.network);
  });

  app.get("/api/overview", async () => {
    const networks = loadNetworks();
    const byFamily = { arbitrum: 0, robinhood: 0, other: 0 };
    for (const n of networks) byFamily[familyOf(n.chainId)] += 1;
    return {
      environment: "TESTNET",
      networks: networks.length,
      byFamily,
      markets: listMarkets().length,
      activeQuotes: listQuotes().filter((q) => q.status === "Active").length,
      executions: listExecutions().length,
      analytics: analyticsSummary(),
      indexer: [...indexerStatus.entries()].map(([k, v]) => ({ network: k, ...v })),
    };
  });

  app.get<{ Params: { txHash: string } }>("/api/tx/:txHash", async (req) => {
    const row = db
      .prepare("SELECT * FROM events WHERE tx_hash = ? ORDER BY log_index LIMIT 1")
      .get(req.params.txHash.toLowerCase()) as { tx_hash: string; network: string } | undefined;
    if (!row) return { status: "unknown", txHash: req.params.txHash };
    const jobs = db.prepare("SELECT * FROM jobs WHERE tx_hash = ?").all(req.params.txHash) as unknown[];
    return { status: jobs.length ? "tracked" : "indexed", txHash: req.params.txHash, jobs };
  });

  return app;
}

export async function startServer() {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  return app;
}
