import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, type Address } from "viem";
import { createRuntime, explainError, loadManifest } from "./chain.ts";
import { listJobs, openDb, publicJob, updateJob } from "./db.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const db = openDb(path.join(root, "api/data/nectar.db"));
const runtime = createRuntime(db);
const manifest = loadManifest();

const app = new Hono();
app.use("*", cors());

function walletOf(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  if (!isAddress(value)) {
    throw Object.assign(new Error("Wallet address is not a valid checksum-able address."), {
      status: 400,
      code: "BAD_AMOUNT",
    });
  }
  return getAddress(value);
}

app.onError((error, c) => {
  const status = (error as { status?: number }).status ?? 500;
  const code = (error as { code?: string }).code ?? "ERROR";
  return c.json(
    {
      error: {
        code,
        message: error.message || explainError(error),
      },
    },
    status as 400,
  );
});

app.get("/health", async (c) => {
  const snap = await runtime.safeAssemble();
  return c.json({
    ok: snap.freshness === "live",
    service: "nectar-api",
    ...runtime.meta(snap.freshness, snap.data ? { blockNumber: snap.data.blockNumber, observedAt: snap.data.observedAt } : undefined),
  });
});

app.get("/v1/networks", async (c) => {
  const snap = await runtime.safeAssemble();
  const connectedId = manifest.chainId;
  const sepoliaStatus =
    connectedId === 421614 && snap.freshness === "live"
      ? "deployed"
      : connectedId === 31337
        ? "local-stand-in"
        : snap.freshness === "unavailable"
          ? "unavailable"
          : "not-deployed";
  return c.json({
    meta: runtime.meta(snap.freshness, snap.data ? { blockNumber: snap.data.blockNumber, observedAt: snap.data.observedAt } : undefined),
    connected: {
      chainId: connectedId,
      name: connectedId === 31337 ? "Local Anvil" : "Arbitrum Sepolia",
      kind: connectedId === 31337 ? "local-rehearsal" : "public-testnet",
      warning:
        connectedId === 31337
          ? "This session reads a local Anvil node. Balances here are not Arbitrum Sepolia balances and cannot settle on Robinhood Chain."
          : "Arbitrum Sepolia testnet. The lending market is a Nectar rehearsal fixture, not production Morpho.",
    },
    networks: [
      {
        id: "arbitrum-sepolia",
        chainId: 421614,
        name: "Arbitrum Sepolia",
        status: sepoliaStatus,
        detail:
          sepoliaStatus === "local-stand-in"
            ? "No Arbitrum Sepolia RPC is connected. The working rehearsal is local Anvil standing in for this slice."
            : sepoliaStatus === "deployed"
              ? "Rehearsal contracts are deployed on Arbitrum Sepolia."
              : sepoliaStatus === "unavailable"
                ? "Deployment data cannot be read. This is not a zero balance."
                : "Contracts are not deployed on Arbitrum Sepolia in this session.",
      },
      {
        id: "robinhood-testnet",
        chainId: 46630,
        name: "Robinhood Chain testnet",
        status: "monitored-only",
        detail:
          "No Nectar escrow, quote registry, or rehearsal market is deployed on Robinhood Chain testnet. Stock-collateral settlement is not live. Figures are omitted on purpose.",
      },
    ],
    deployment: {
      ...manifest,
      audited: false,
    },
    demo: {
      enabled: Boolean(runtime.demoAccounts()),
      maker: manifest.chainId === 31337 ? manifest.demoMaker : null,
      keeper: manifest.chainId === 31337 ? "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" : null,
      keeperAllowlist: false,
      keeperNote: "This prototype does not allowlist keepers. Any account may submit, and the executor still enforces the quote.",
    },
  });
});

app.get("/v1/workspace", async (c) => {
  const wallet = walletOf(c.req.query("wallet"));
  const snap = await runtime.safeAssemble(wallet);
  return c.json({
    meta: runtime.meta(snap.freshness, snap.data ? { blockNumber: snap.data.blockNumber, observedAt: snap.data.observedAt } : undefined),
    workspace: snap.data,
    jobs: listJobs(db).map(publicJob),
  });
});

app.get("/v1/markets", async (c) => {
  const snap = await runtime.safeAssemble();
  return c.json({
    meta: runtime.meta(snap.freshness, snap.data ? { blockNumber: snap.data.blockNumber, observedAt: snap.data.observedAt } : undefined),
    markets: snap.data ? [snap.data.market] : [],
  });
});

app.get("/v1/markets/:key", async (c) => {
  const snap = await runtime.safeAssemble();
  const market = snap.data?.market;
  if (!market || market.marketKey.toLowerCase() !== c.req.param("key").toLowerCase()) {
    return c.json({
      meta: runtime.meta(snap.freshness),
      market: null,
      error: { code: "UNSUPPORTED_MARKET", message: "No integrated market matches that key in this prototype." },
    });
  }
  return c.json({ meta: runtime.meta("live", { blockNumber: snap.data!.blockNumber, observedAt: snap.data!.observedAt }), market, quotes: snap.data!.quotes });
});

app.get("/v1/accounts/:wallet/liquidity", async (c) => {
  const wallet = walletOf(c.req.param("wallet"));
  const snap = await runtime.safeAssemble(wallet);
  return c.json({
    meta: runtime.meta(snap.freshness, snap.data ? { blockNumber: snap.data.blockNumber, observedAt: snap.data.observedAt } : undefined),
    liquidity: snap.data?.liquidity ?? null,
  });
});

app.get("/v1/quotes", async (c) => {
  const snap = await runtime.safeAssemble();
  return c.json({
    meta: runtime.meta(snap.freshness, snap.data ? { blockNumber: snap.data.blockNumber, observedAt: snap.data.observedAt } : undefined),
    quotes: snap.data?.quotes ?? null,
  });
});

app.get("/v1/receipts", async (c) => {
  const snap = await runtime.safeAssemble();
  return c.json({
    meta: runtime.meta(snap.freshness, snap.data ? { blockNumber: snap.data.blockNumber, observedAt: snap.data.observedAt } : undefined),
    receipts: snap.data?.receipts ?? null,
  });
});

app.get("/v1/jobs", (c) => c.json({ jobs: listJobs(db).map(publicJob) }));

app.get("/v1/jobs/:id", (c) => {
  const job = listJobs(db).map(publicJob).find((item) => item.id === c.req.param("id"));
  if (!job) return c.json({ error: { code: "NOT_FOUND", message: "No job with that id." } }, 404);
  return c.json({ job });
});

app.post("/v1/jobs/:id/cancel", async (c) => {
  const row = listJobs(db).find((item) => item.id === c.req.param("id"));
  if (!row) return c.json({ error: { code: "NOT_FOUND", message: "No job with that id." } }, 404);
  if (row.status !== "awaiting_signature") {
    return c.json({ error: { code: "NOT_ACTIVE", message: "Only a job awaiting signature can be dismissed." } }, 409);
  }
  const updated = updateJob(db, row.id, { status: "rejected", reason: "Dismissed before submission" });
  return c.json({ job: publicJob(updated!) });
});

app.post("/v1/jobs/preview", async (c) => {
  const body = await c.req.json();
  const reservationId = body.reservationId as string | undefined;
  if (!reservationId) {
    return c.json({ error: { code: "BAD_AMOUNT", message: "reservationId is required." } }, 400);
  }
  try {
    const plan = await runtime.planExecute(reservationId);
    return c.json({ meta: runtime.meta("live"), preview: plan.preview, plan });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 400;
    return c.json({ error: { code: (error as { code?: string }).code ?? "PREVIEW_FAILED", message: explainError(error) } }, status as 400);
  }
});

async function demoRoute(
  c: { req: { json: () => Promise<Record<string, unknown>> }; json: (body: unknown, status?: number) => Response },
  kind: "deposit" | "quote" | "execute" | "withdraw" | "release",
) {
  const body = await c.req.json().catch(() => ({}));
  const confirm = Boolean(body.confirm);
  const jobId = typeof body.jobId === "string" ? body.jobId : undefined;
  try {
    if (kind === "deposit") {
      const amount = String(body.amount ?? "");
      if (!confirm) return c.json({ plan: await runtime.planDeposit(amount), confirmRequired: true });
      return c.json({ job: await runtime.confirmDeposit(amount, jobId) });
    }
    if (kind === "quote") {
      const borrower = typeof body.borrower === "string" ? (body.borrower as Address) : undefined;
      if (!confirm) return c.json({ plan: await runtime.planQuote(borrower), confirmRequired: true });
      return c.json({ job: await runtime.confirmQuote(borrower, jobId) });
    }
    if (kind === "execute") {
      const reservationId = String(body.reservationId ?? "");
      if (!confirm) return c.json({ plan: await runtime.planExecute(reservationId), confirmRequired: true });
      return c.json({ job: await runtime.confirmExecute(reservationId, jobId) });
    }
    if (kind === "withdraw") {
      const amount = String(body.amount ?? "");
      if (!confirm) return c.json({ plan: await runtime.planWithdraw(amount), confirmRequired: true });
      return c.json({ job: await runtime.confirmWithdraw(amount, jobId) });
    }
    const reservationId = String(body.reservationId ?? "");
    if (!confirm) {
      return c.json({
        plan: {
          network: { name: manifest.chainId === 31337 ? "Local Anvil rehearsal" : "Arbitrum Sepolia", chainId: manifest.chainId },
          asset: manifest.debtSymbol,
          destination: manifest.quotes,
          destinationLabel: "Release expired reservation",
          expiry: "already due",
          fee: "No fee. Release returns reserved cash to the same maker.",
        },
        confirmRequired: true,
      });
    }
    return c.json({ job: await runtime.confirmRelease(reservationId, jobId) });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 400;
    return c.json(
      {
        error: {
          code: (error as { code?: string }).code ?? "REJECTED",
          message: error instanceof Error ? error.message : explainError(error),
          available: (error as { available?: string }).available ?? null,
        },
      },
      status as 400,
    );
  }
}

app.post("/v1/demo/deposit", (c) => demoRoute(c, "deposit"));
app.post("/v1/demo/quote", (c) => demoRoute(c, "quote"));
app.post("/v1/demo/execute", (c) => demoRoute(c, "execute"));
app.post("/v1/demo/withdraw", (c) => demoRoute(c, "withdraw"));
app.post("/v1/demo/release", (c) => demoRoute(c, "release"));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`nectar api listening on ${port} chain ${manifest.chainId}`);
});
