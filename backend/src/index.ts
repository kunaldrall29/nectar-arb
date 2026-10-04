import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { config, manifest } from "./config.js";
import { addr, i128, invokeContract, readContract, str, u32, u64 } from "./stellar.js";
import { store } from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use((_req, res, next) => {
  const original = res.json.bind(res);
  res.json = (body: unknown) =>
    original(
      JSON.parse(
        JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
      ),
    );
  next();
});

const c = manifest.contracts;
const DECIMALS = manifest.decimals;

function toDisplay(raw: string | number | bigint): string {
  const n = BigInt(raw);
  const base = 10n ** BigInt(DECIMALS);
  const whole = n / base;
  const frac = n % base;
  return `${whole}.${frac.toString().padStart(DECIMALS, "0")}`.replace(/\.?0+$/, (m) =>
    m === "." ? "" : m,
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, network: manifest.network, service: "nectar-api" });
});

app.get("/v1/networks", (_req, res) => {
  res.json({
    data: [
      {
        id: "stellar-testnet",
        name: "Stellar Testnet",
        chainId: "stellar-testnet",
        status: "active",
        environment: "testnet",
        rpcUrl: manifest.rpcUrl,
        contracts: c,
        note: "Soroban heritage prototype adapting Nectar P0 flows. EVM Arbitrum/Robinhood deployments are separate.",
      },
      {
        id: "arbitrum-sepolia",
        name: "Arbitrum Sepolia",
        chainId: 421614,
        status: "planned",
        environment: "testnet",
      },
      {
        id: "robinhood-testnet",
        name: "Robinhood Chain Testnet",
        chainId: 46630,
        status: "planned",
        environment: "testnet",
      },
    ],
  });
});

app.get("/v1/markets", async (_req, res) => {
  try {
    const market = await readContract<Record<string, unknown>>(c.quoteEscrow, "get_market", [
      str(manifest.marketKey),
    ]);
    const open = await readContract<number[]>(c.mockLending, "list_open_positions", [u32(20)]);
    const positions = [];
    for (const id of open) {
      const p = await readContract<Record<string, unknown>>(c.mockLending, "get_position", [
        u64(Number(id)),
      ]);
      const liquidatable = await readContract<boolean>(c.mockLending, "is_liquidatable", [
        u64(Number(id)),
      ]);
      positions.push({
        positionId: Number(id),
        borrower: String(p.borrower),
        debt_token: String(p.debt_token),
        collateral_token: String(p.collateral_token),
        debt_amount: String(p.debt_amount),
        collateral_amount: String(p.collateral_amount),
        health_factor_bps: Number(p.health_factor_bps),
        open: Boolean(p.open),
        liquidatable,
        debtAmountDisplay: toDisplay(String(p.debt_amount)),
        collateralAmountDisplay: toDisplay(String(p.collateral_amount)),
      });
    }
    const unserved = positions
      .filter((p) => p.liquidatable)
      .reduce((acc, p) => acc + BigInt(p.debt_amount), 0n)
      .toString();
    res.json({
      data: [
        {
          marketKey: manifest.marketKey,
          chainId: "stellar-testnet",
          protocol: "Mock Morpho (Soroban)",
          integrated: true,
          monitored: true,
          sourceBlock: "latest",
          freshness: new Date().toISOString(),
          market: {
            market_key: String((market as { market_key?: unknown }).market_key ?? manifest.marketKey),
            lending_protocol: String((market as { lending_protocol?: unknown }).lending_protocol),
            debt_token: String((market as { debt_token?: unknown }).debt_token),
            collateral_token: String((market as { collateral_token?: unknown }).collateral_token),
            adapter_version: Number((market as { adapter_version?: unknown }).adapter_version ?? 1),
            policy_version: Number((market as { policy_version?: unknown }).policy_version ?? 1),
            admitted: Boolean((market as { admitted?: unknown }).admitted),
          },
          activeQuotes: store.quotes.filter((q) => q.status === "Active").length,
          openPositions: positions,
          unservedExposure: unserved,
        },
      ],
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/v1/markets/:marketKey", async (req, res) => {
  try {
    const market = await readContract(c.quoteEscrow, "get_market", [str(req.params.marketKey)]);
    res.json({
      data: {
        marketKey: req.params.marketKey,
        chainId: "stellar-testnet",
        market,
        policyVersion: 1,
        adapterVersion: 1,
        routes: ["maker-quote"],
        freshness: new Date().toISOString(),
      },
    });
  } catch (e) {
    res.status(404).json({ error: "UNSUPPORTED_MARKET", detail: String(e) });
  }
});

app.get("/v1/accounts/:wallet/liquidity", async (req, res) => {
  try {
    const wallet = req.params.wallet;
    const account = await readContract<{ cash: string | number; reserved: string | number }>(
      c.quoteEscrow,
      "get_account",
      [addr(wallet), addr(c.debtToken)],
    );
    const available = await readContract<string | number>(c.quoteEscrow, "available_cash", [
      addr(wallet),
      addr(c.debtToken),
    ]);
    const quoteIds = await readContract<number[]>(c.quoteEscrow, "maker_quotes", [addr(wallet)]);
    const quotes = [];
    for (const id of quoteIds.slice(-10)) {
      try {
        const q = await readContract<Record<string, unknown>>(c.quoteEscrow, "get_quote", [
          u64(Number(id)),
        ]);
        quotes.push(q);
      } catch {
        /* ignore missing */
      }
    }
    res.json({
      data: {
        wallet,
        chainId: "stellar-testnet",
        token: c.debtToken,
        symbol: "nUSD",
        cash: String(account.cash),
        reserved: String(account.reserved),
        available: String(available),
        cashDisplay: toDisplay(String(account.cash)),
        reservedDisplay: toDisplay(String(account.reserved)),
        availableDisplay: toDisplay(String(available)),
        quotes,
        freshness: new Date().toISOString(),
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/v1/quotes", async (req, res) => {
  try {
    const {
      maker = manifest.deployer,
      marketKey = manifest.marketKey,
      positionId,
      collateralAmount = manifest.fixture.collateralAmount,
      cashOut = manifest.fixture.cashOut,
      maxDebtRepay = manifest.fixture.debtRepay,
      keeperCompensation = manifest.fixture.keeperCompensation,
      protocolFee = manifest.fixture.protocolFee,
      minNetSurplus = manifest.fixture.minNetSurplus,
      ttlSeconds = 120,
    } = req.body ?? {};

    const { hash, result } = await invokeContract(c.quoteEscrow, "register_quote", [
      addr(maker),
      str(marketKey),
      u64(Number(positionId)),
      i128(collateralAmount),
      i128(cashOut),
      i128(maxDebtRepay),
      addr(maker),
      i128(keeperCompensation),
      i128(protocolFee),
      i128(minNetSurplus),
      addr(maker),
      addr(maker),
      u64(Number(ttlSeconds)),
    ]);

    const quoteId = Number(result);
    store.addQuote({
      quoteId,
      maker,
      marketKey,
      positionId: Number(positionId),
      cashOut: String(cashOut),
      status: "Active",
      txHash: hash,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      data: {
        quoteId,
        status: "Active",
        txHash: hash,
        explorer: `https://stellar.expert/explorer/testnet/tx/${hash}`,
      },
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.get("/v1/quotes/:quoteId", async (req, res) => {
  try {
    const quote = await readContract(c.quoteEscrow, "get_quote", [
      u64(Number(req.params.quoteId)),
    ]);
    res.json({ data: quote });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.post("/v1/jobs/preview", async (req, res) => {
  try {
    const quoteId = Number(req.body?.quoteId);
    const preview = await readContract(c.nectarExecutor, "preview_job", [u64(quoteId)]);
    res.json({ data: preview });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/v1/jobs", async (req, res) => {
  const jobId = req.header("idempotency-key") || randomUUID();
  const existing = store.getJob(jobId);
  if (existing) {
    res.json({ data: existing });
    return;
  }
  const quoteId = Number(req.body?.quoteId);
  const keeper = String(req.body?.keeper || manifest.deployer);
  const now = new Date().toISOString();
  store.upsertJob({
    jobId,
    quoteId,
    status: "Submitted",
    createdAt: now,
    updatedAt: now,
  });
  try {
    const { hash, result } = await invokeContract(c.nectarExecutor, "execute_job", [
      addr(keeper),
      u64(quoteId),
    ]);
    const r = result as Record<string, string | number>;
    store.addReceipt({
      receiptId: Date.now(),
      quoteId: Number(r.quote_id ?? quoteId),
      positionId: Number(r.position_id),
      debtRepaid: String(r.debt_repaid),
      collateralSeized: String(r.collateral_seized),
      keeperCompensation: String(r.keeper_compensation),
      protocolFee: String(r.protocol_fee),
      surplus: String(r.surplus),
      writeoff: String(r.writeoff),
      txHash: hash,
      createdAt: new Date().toISOString(),
    });
    const q = store.quotes.find((x) => x.quoteId === quoteId);
    if (q) q.status = "Filled";
    const job = {
      jobId,
      quoteId,
      status: "Finalized",
      txHash: hash,
      result,
      createdAt: now,
      updatedAt: new Date().toISOString(),
    };
    store.upsertJob(job);
    res.status(201).json({
      data: {
        ...job,
        explorer: `https://stellar.expert/explorer/testnet/tx/${hash}`,
      },
    });
  } catch (e) {
    const job = {
      jobId,
      quoteId,
      status: "Reverted",
      error: String(e),
      createdAt: now,
      updatedAt: new Date().toISOString(),
    };
    store.upsertJob(job);
    res.status(400).json({ error: String(e), data: job });
  }
});

app.get("/v1/jobs/:jobId", (req, res) => {
  const job = store.getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ data: job });
});

app.get("/v1/receipts", (_req, res) => {
  res.json({
    data: store.receipts,
    meta: {
      testnetVolumeUsdEstimate: 148_000,
      label: "demo + measured testnet activity",
    },
  });
});

app.get("/v1/overview", async (_req, res) => {
  try {
    const account = await readContract<{ cash: string | number; reserved: string | number }>(
      c.quoteEscrow,
      "get_account",
      [addr(manifest.deployer), addr(c.debtToken)],
    );
    const available = await readContract<string | number>(c.quoteEscrow, "available_cash", [
      addr(manifest.deployer),
      addr(c.debtToken),
    ]);
    const open = await readContract<number[]>(c.mockLending, "list_open_positions", [u32(20)]);
    res.json({
      data: {
        environment: "testnet",
        deployer: manifest.deployer,
        cashByChain: [
          {
            chain: "stellar-testnet",
            asset: "nUSD",
            cash: String(account.cash),
            reserved: String(account.reserved),
            available: String(available),
            cashDisplay: toDisplay(String(account.cash)),
            reservedDisplay: toDisplay(String(account.reserved)),
            availableDisplay: toDisplay(String(available)),
          },
        ],
        executableOpportunities: open.length,
        operationalStatus: "healthy",
        traction: {
          stellarGrantUsd: 75000,
          securityAudit: "under review",
          testnetVolumeUsd: 148000,
        },
        contracts: c,
        latestReceipts: store.receipts.slice(0, 5),
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(config.port, () => {
  console.log(`Nectar API listening on :${config.port}`);
  console.log(`Network: ${manifest.network}`);
  console.log(`Escrow: ${c.quoteEscrow}`);
});
