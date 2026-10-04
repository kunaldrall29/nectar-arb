import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { readLiquidity, manifest, getActiveDeployment } from "./chain.js";
import type { Address } from "viem";

const app = new Hono();
app.use("/*", cors());

const idempotency = new Map<string, string>();
const quotes = new Map<string, Record<string, unknown>>();
const jobs = new Map<string, Record<string, unknown>>();
const receipts: Record<string, unknown>[] = [];

app.get("/health", (c) => c.json({ ok: true, release: manifest.release }));

app.get("/v1/networks", (c) =>
  c.json({
    data: manifest.networks.map((n) => ({
      name: n.name,
      chainId: n.chainId,
      status: n.status,
      rpcConfigured: Boolean(n.rpcUrl || process.env.ARBITRUM_SEPOLIA_RPC_URL),
      keeperAllowlist: n.keeperAllowlist ?? false,
      freshness: new Date().toISOString(),
    })),
  }),
);

app.get("/v1/markets", (c) => {
  const chainId = Number(c.req.query("chainId") ?? "421614");
  const net = getActiveDeployment(chainId);
  return c.json({
    data: [
      {
        marketKey: net.marketKey,
        chainId,
        protocol: "morpho-blue-demo",
        debtToken: net.contracts!.debtToken,
        collateralToken: net.contracts!.collateralToken,
        adapter: net.contracts!.demoAdapter,
        status: "integrated",
        label: "Testnet rehearsal market (mock adapter)",
      },
    ],
  });
});

app.get("/v1/markets/:marketKey", (c) => {
  const chainId = Number(c.req.query("chainId") ?? "421614");
  const net = getActiveDeployment(chainId);
  return c.json({
    marketKey: c.req.param("marketKey"),
    chainId,
    policyVersion: "nectar-policy-v1",
    routes: [{ type: "maker_quote", status: "supported" }],
    contracts: net.contracts,
    freshness: new Date().toISOString(),
  });
});

app.get("/v1/accounts/:wallet/liquidity", async (c) => {
  try {
    const wallet = c.req.param("wallet") as Address;
    const chainId = Number(c.req.query("chainId") ?? "421614");
    const view = await readLiquidity(wallet, chainId);
    return c.json({ data: view });
  } catch {
    return c.json({ error: { code: "RPC_UNAVAILABLE", message: "Cannot read chain state" } }, 503);
  }
});

app.post("/v1/quotes", async (c) => {
  const key = c.req.header("idempotency-key");
  const body = await c.req.json();
  if (key && idempotency.has(key) && idempotency.get(key) !== JSON.stringify(body)) {
    return c.json({ error: { code: "CONFLICT", message: "Idempotency key reused with different body" } }, 409);
  }
  const quoteId = String(body.quoteNonce ?? body.reservationId ?? Date.now());
  quotes.set(quoteId, { ...body, state: "Signed", updatedAt: new Date().toISOString() });
  if (key) idempotency.set(key, JSON.stringify(body));
  const net = getActiveDeployment(body.chainId ?? 421614);
  return c.json({
    quoteId,
    registration: {
      chainId: body.chainId ?? 421614,
      contract: net.contracts!.quoteEscrow,
      method: "registerQuote",
      args: ["quote", "signature"],
    },
  });
});

app.get("/v1/quotes/:quoteId", (c) => {
  const q = quotes.get(c.req.param("quoteId"));
  if (!q) return c.json({ error: { code: "NOT_FOUND" } }, 404);
  return c.json({ data: q });
});

app.post("/v1/jobs/preview", async (c) => {
  const body = await c.req.json();
  return c.json({
    data: {
      ok: true,
      route: body.route ?? "maker_quote",
      simulationAgeMs: 0,
      refusalCode: null,
    },
  });
});

app.post("/v1/jobs", async (c) => {
  const key = c.req.header("idempotency-key") ?? `job-${Date.now()}`;
  if (jobs.has(key)) return c.json({ data: jobs.get(key) });
  const body = await c.req.json();
  const job = {
    jobId: key,
    state: body.txHash ? "Submitted" : "Simulated",
    ...body,
    updatedAt: new Date().toISOString(),
  };
  jobs.set(key, job);
  return c.json({ data: job });
});

app.get("/v1/jobs/:jobId", (c) => {
  const job = jobs.get(c.req.param("jobId"));
  if (!job) return c.json({ error: { code: "NOT_FOUND" } }, 404);
  return c.json({ data: job });
});

app.get("/v1/receipts", (c) => c.json({ data: receipts }));

const port = Number(process.env.API_PORT ?? 8787);
console.log(`Nectar API listening on :${port}`);
serve({ fetch: app.fetch, port });
