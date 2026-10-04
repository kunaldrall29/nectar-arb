import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { createPublicClient, http, formatUnits } from "viem";
import { db } from "./db.js";
import { escrowAbi, registryAbi } from "./abis.js";
import { chain, getRpcUrl, loadManifest } from "./config.js";
import { syncIndexer } from "./indexer.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const manifest = loadManifest();
const client = createPublicClient({ chain, transport: http(getRpcUrl()) });

app.get("/v1/networks", async () => {
  return {
    networks: [
      {
        chainId: 421614,
        name: "Arbitrum Sepolia",
        environment: "testnet",
        status: manifest ? "active" : "pending_deploy",
        deployment: manifest,
      },
      {
        chainId: 46630,
        name: "Robinhood Chain Testnet",
        environment: "testnet",
        status: "not_deployed",
        note: "Hackathon slice deployed on Arbitrum Sepolia only (labeled scope cut).",
      },
    ],
    refreshedAt: new Date().toISOString(),
  };
});

app.get("/v1/markets", async () => {
  if (!manifest) return { markets: [], freshness: { stale: true } };
  const marketKey = manifest.marketKey as `0x${string}`;
  const policy = await client.readContract({
    address: manifest.contracts.MarketRegistry as `0x${string}`,
    abi: registryAbi,
    functionName: "getMarket",
    args: [marketKey],
  });
  return {
    markets: [
      {
        marketKey: manifest.marketKey,
        chainId: manifest.chainId,
        protocol: "MockLendingMarket (Morpho adapter path; testnet mock)",
        debtToken: policy.debtToken,
        collateralToken: policy.collateralToken,
        adapterVersion: policy.adapterVersion.toString(),
        policyHash: policy.policyHash,
        active: policy.active,
        label: "PX05 testnet mock lending — not production Morpho Blue",
      },
    ],
    sourceBlock: manifest.blockNumber,
    refreshedAt: new Date().toISOString(),
  };
});

app.get("/v1/markets/:marketKey", async (req) => {
  const { marketKey } = req.params as { marketKey: string };
  const res = await app.inject({ method: "GET", url: "/v1/markets" });
  const body = JSON.parse(res.body);
  const market = body.markets.find((m: { marketKey: string }) => m.marketKey.toLowerCase() === marketKey.toLowerCase());
  if (!market) return { error: "UNSUPPORTED_MARKET" };
  return { market, routes: [{ type: "maker_quote", status: "supported" }] };
});

app.get("/v1/accounts/:wallet/liquidity", async (req) => {
  const { wallet } = req.params as { wallet: string };
  if (!manifest) return { error: "RPC_UNAVAILABLE", wallet };
  const token = manifest.contracts.DebtToken as `0x${string}`;
  const escrow = manifest.contracts.QuoteEscrow as `0x${string}`;
  const [balance, reserved, available] = await Promise.all([
    client.readContract({ address: escrow, abi: escrowAbi, functionName: "balances", args: [wallet as `0x${string}`, token] }),
    client.readContract({ address: escrow, abi: escrowAbi, functionName: "reserved", args: [wallet as `0x${string}`, token] }),
    client.readContract({ address: escrow, abi: escrowAbi, functionName: "available", args: [wallet as `0x${string}`, token] }),
  ]);
  const block = await client.getBlockNumber();
  return {
    chainId: manifest.chainId,
    wallet,
    token,
    balance: balance.toString(),
    reserved: reserved.toString(),
    available: available.toString(),
    display: {
      balance: formatUnits(balance, 6),
      reserved: formatUnits(reserved, 6),
      available: formatUnits(available, 6),
    },
    sourceBlock: block.toString(),
    refreshedAt: new Date().toISOString(),
  };
});

app.post("/v1/jobs/preview", async (req) => {
  const body = req.body as { route: Record<string, unknown> };
  if (!manifest) return { ok: false, reason: "RPC_UNAVAILABLE" };
  const executor = manifest.contracts.NectarExecutor as `0x${string}`;
  const { executorAbi } = await import("./abis.js");
  const route = body.route as never;
  const [ok, reason] = await client.readContract({
    address: executor,
    abi: executorAbi,
    functionName: "previewJob",
    args: [route],
  });
  return { ok, reason, simulationAgeMs: 0 };
});

app.get("/v1/receipts", async () => {
  const rows = db.prepare(`SELECT * FROM receipts ORDER BY block_number DESC LIMIT 100`).all();
  return { receipts: rows };
});

app.post("/v1/admin/sync", async () => {
  const result = await syncIndexer();
  return result;
});

app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 8787);
await syncIndexer().catch(() => undefined);
app.listen({ port, host: "0.0.0.0" });
