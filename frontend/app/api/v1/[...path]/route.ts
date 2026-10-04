import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { agentReply } from "@/lib/agent";
import {
  ADMIN_PUBLIC,
  CHAIN_ID,
  CONTRACTS,
  LIVE,
  MARKET_KEY,
  NETWORKS,
  explorerContract,
  explorerTx,
} from "@/lib/config";
import {
  UNIT,
  adminKey,
  friendbot,
  getAccount,
  getMarket,
  getPosition,
  getQuote,
  getReceipt,
  invoke,
  isLiquidatable,
  mint,
  quoteSpec,
  read,
  scAddress,
  scBytes32,
  scI128,
  tokenBalance,
} from "@/lib/stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Store = {
  jobs: Array<Record<string, unknown>>;
};

const store: Store = {
  jobs: [
    {
      jobId: "job-live-fixture",
      quoteId: LIVE.quoteId,
      state: "finalized",
      chainId: CHAIN_ID,
      tx: LIVE.transactions.execute,
      receipt: LIVE.receipt,
      explorer: explorerTx(LIVE.transactions.execute),
      selfOperated: true,
    },
  ],
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function freshness() {
  return {
    chainId: CHAIN_ID,
    source: "stellar-testnet",
    observedAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  try {
    const path = ctx.params.path || [];
    const [a, b, c] = path;
    if (a === "health") return json({ ok: true, ...freshness() });
    if (a === "networks") {
      return json({ networks: NETWORKS, ...freshness() });
    }
    if (a === "markets" && !b) {
      const market = await getMarket().catch(() => null);
      return json({
        markets: [
          {
            marketKey: MARKET_KEY,
            chainId: CHAIN_ID,
            chain: "Stellar Testnet",
            protocol: "Nectar Lab",
            marketId: "HOOD_USDC",
            debtToken: { symbol: "USDC", address: CONTRACTS.usdc, decimals: 7 },
            collateral: { symbol: "HOOD", address: CONTRACTS.hood, decimals: 7 },
            status: "integrated",
            routes: ["funded_quote"],
            priceStatus: "session_valid",
            admitted: Boolean((market as { admitted?: boolean } | null)?.admitted ?? true),
            unserved: "0",
            explorer: explorerContract(CONTRACTS.nectar),
          },
          {
            marketKey: "arb-sepolia-pending",
            chainId: 421614,
            chain: "Arbitrum Sepolia",
            protocol: "Morpho Blue",
            marketId: "pending_admission",
            status: "monitored",
            routes: [],
            note: "No supported route is a valid state, not a loading error.",
          },
          {
            marketKey: "rh-testnet-pending",
            chainId: 46630,
            chain: "Robinhood Chain Testnet",
            protocol: "Morpho Blue",
            marketId: "pending_admission",
            status: "monitored",
            routes: [],
            note: "Stock-collateral specialization after this Stellar slice.",
          },
        ],
        ...freshness(),
      });
    }
    if (a === "markets" && b) {
      const market = await getMarket();
      return json({ market, marketKey: b, ...freshness() });
    }
    if (a === "accounts" && b && c === "liquidity") {
      const acct = (await getAccount(b)) as { cash?: string; reserved?: string };
      const walletUsdc = await tokenBalance(CONTRACTS.usdc, b).catch(() => "0");
      const walletHood = await tokenBalance(CONTRACTS.hood, b).catch(() => "0");
      const cash = BigInt(acct?.cash || 0);
      const reserved = BigInt(acct?.reserved || 0);
      return json({
        wallet: b,
        token: CONTRACTS.usdc,
        walletUsdc: String(walletUsdc),
        walletHood: String(walletHood),
        fundedCash: String(cash),
        reservedCash: String(reserved),
        availableCash: String(cash - reserved),
        ...freshness(),
      });
    }
    if (a === "quotes" && b) {
      const quote = await getQuote(b);
      return json({ quote, quoteId: b, ...freshness() });
    }
    if (a === "jobs" && b) {
      const found = store.jobs.find((j) => j.jobId === b || j.quoteId === b);
      return json({ job: found || null, ...freshness() });
    }
    if (a === "receipts") {
      const receipts = [];
      try {
        receipts.push({
          quoteId: LIVE.quoteId,
          tx: LIVE.transactions.execute,
          explorer: explorerTx(LIVE.transactions.execute),
          ...(await getReceipt(LIVE.quoteId).catch(() => LIVE.receipt)),
          selfOperated: true,
        });
      } catch {
        receipts.push({ quoteId: LIVE.quoteId, ...LIVE.receipt, selfOperated: true });
      }
      return json({ receipts, ...freshness() });
    }
    return json({ error: "not_found", path }, 404);
  } catch (error) {
    return json({ error: errMessage(error), ...freshness() }, 500);
  }
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  try {
    const path = ctx.params.path || [];
    const body = await req.json().catch(() => ({}));
    const [a, b] = path;

    if (a === "wallet" && b === "create") {
      const kp = Keypair.random();
      return json({ publicKey: kp.publicKey(), secret: kp.secret(), ...freshness() });
    }

    if (a === "wallet" && b === "fund") {
      const address = String(body.address || "");
      if (!address.startsWith("G")) return json({ error: "invalid address" }, 400);
      await friendbot(address);
      return json({ funded: true, address, ...freshness() });
    }

    if (a === "faucet") {
      const address = String(body.address || "");
      const amount = BigInt(body.amount || 20_000n * UNIT);
      const minted = await mint(address, CONTRACTS.usdc, amount);
      return json({ minted: String(amount), tx: minted.hash, explorer: minted.hash ? explorerTx(minted.hash) : null, ...freshness() });
    }

    if (a === "quotes") {
      const source = Keypair.fromSecret(String(body.secret));
      const maker = source.publicKey();
      const validUntil = Math.floor(Date.now() / 1000) + Number(body.ttl || 180);
      const spec = quoteSpec({
        borrower: String(body.borrower || LIVE.borrower),
        maker,
        cashOut: BigInt(body.cashOut || 10_140n * UNIT),
        collateralAmount: BigInt(body.collateralAmount || 12_000n * UNIT),
        maxDebtRepay: BigInt(body.maxDebtRepay || 10_000n * UNIT),
        keeper: String(body.keeper || maker),
        validUntil,
      });
      const sent = await invoke({
        contract: CONTRACTS.nectar,
        method: "register_quote",
        args: [scAddress(maker), spec],
        source,
      });
      const quoteId = String(sent.result || "").replace(/"/g, "");
      return json({
        quoteId,
        tx: sent.hash,
        explorer: sent.hash ? explorerTx(sent.hash) : null,
        validUntil,
        ...freshness(),
      });
    }

    if (a === "jobs" && b === "preview") {
      const quoteId = String(body.quoteId || "");
      const preview = await read(CONTRACTS.nectar, "preview_job", [scBytes32(quoteId)]);
      return json({ preview, quoteId, ...freshness() });
    }

    if (a === "jobs" && !b) {
      const source = Keypair.fromSecret(String(body.secret));
      const quoteId = String(body.quoteId || "");
      const sent = await invoke({
        contract: CONTRACTS.nectar,
        method: "execute_job",
        args: [scAddress(source.publicKey()), scBytes32(quoteId)],
        source,
      });
      const job = {
        jobId: `job-${quoteId.slice(0, 8)}`,
        quoteId,
        state: "included",
        tx: sent.hash,
        receipt: sent.result,
        explorer: sent.hash ? explorerTx(sent.hash) : null,
        selfOperated: true,
      };
      store.jobs.unshift(job);
      return json({ job, ...freshness() });
    }

    if (a === "liquidity" && b === "deposit") {
      const source = Keypair.fromSecret(String(body.secret));
      const amount = BigInt(body.amount || 10_140n * UNIT);
      const sent = await invoke({
        contract: CONTRACTS.nectar,
        method: "deposit",
        args: [
          scAddress(source.publicKey()),
          scAddress(CONTRACTS.usdc),
          scI128(amount),
          scAddress(source.publicKey()),
        ],
        source,
      });
      return json({
        cash: sent.result,
        tx: sent.hash,
        explorer: sent.hash ? explorerTx(sent.hash) : null,
        ...freshness(),
      });
    }

    if (a === "liquidity" && b === "withdraw") {
      const source = Keypair.fromSecret(String(body.secret));
      const amount = BigInt(body.amount || 0);
      const sent = await invoke({
        contract: CONTRACTS.nectar,
        method: "withdraw",
        args: [
          scAddress(source.publicKey()),
          scAddress(CONTRACTS.usdc),
          scI128(amount),
          scAddress(source.publicKey()),
        ],
        source,
      });
      return json({
        available: sent.result,
        tx: sent.hash,
        explorer: sent.hash ? explorerTx(sent.hash) : null,
        ...freshness(),
      });
    }

    if (a === "demo" && b === "rehearse") {
      return json(await runRehearsal(body.address));
    }

    if (a === "agent" && b === "chat") {
      const wallet = String(body.wallet || "");
      let cash = "0";
      let reserved = "0";
      if (wallet.startsWith("G")) {
        const acct = (await getAccount(wallet).catch(() => ({ cash: "0", reserved: "0" }))) as {
          cash?: string;
          reserved?: string;
        };
        cash = String(acct?.cash || 0);
        reserved = String(acct?.reserved || 0);
      }
      const reply = agentReply(String(body.message || ""), {
        wallet,
        cash,
        reserved,
        network: "Stellar Testnet",
      });
      return json({ reply, cash, reserved, ...freshness() });
    }

    if (a === "seed" && b === "position") {
      const borrower = String(body.borrower || LIVE.borrower);
      const admin = adminKey();
      const hoodMint = await mint(ADMIN_PUBLIC, CONTRACTS.hood, 12_000n * UNIT);
      const seeded = await invoke({
        contract: CONTRACTS.lending,
        method: "admin_seed_position",
        args: [
          scAddress(ADMIN_PUBLIC),
          scAddress(borrower),
          scAddress(CONTRACTS.hood),
          scI128(12_000n * UNIT),
          scAddress(CONTRACTS.usdc),
          scI128(10_000n * UNIT),
          scI128(8_000_000n),
        ],
        source: admin,
      });
      return json({
        borrower,
        txs: { hoodMint: hoodMint.hash, seed: seeded.hash },
        liquidatable: await isLiquidatable(borrower),
        position: await getPosition(borrower).catch(() => null),
        ...freshness(),
      });
    }

    return json({ error: "not_found", path }, 404);
  } catch (error) {
    return json({ error: errMessage(error) }, 500);
  }
}

async function runRehearsal(sessionAddress?: string) {
  const admin = adminKey();
  const maker = sessionAddress?.startsWith("G") ? sessionAddress : admin.publicKey();
  const borrower = LIVE.borrower;
  const steps: Array<Record<string, unknown>> = [];

  const usdcMint = await mint(admin.publicKey(), CONTRACTS.usdc, 20_000n * UNIT);
  steps.push({ step: "mint_usdc", tx: usdcMint.hash, explorer: explorerTx(usdcMint.hash || "") });
  const hoodMint = await mint(admin.publicKey(), CONTRACTS.hood, 12_000n * UNIT);
  steps.push({ step: "mint_hood", tx: hoodMint.hash });

  try {
    const seed = await invoke({
      contract: CONTRACTS.lending,
      method: "admin_seed_position",
      args: [
        scAddress(ADMIN_PUBLIC),
        scAddress(borrower),
        scAddress(CONTRACTS.hood),
        scI128(12_000n * UNIT),
        scAddress(CONTRACTS.usdc),
        scI128(10_000n * UNIT),
        scI128(8_000_000n),
      ],
      source: admin,
    });
    steps.push({ step: "seed_position", tx: seed.hash, explorer: explorerTx(seed.hash || "") });
  } catch (error) {
    steps.push({ step: "seed_position", note: errMessage(error) });
  }

  const deposit = await invoke({
    contract: CONTRACTS.nectar,
    method: "deposit",
    args: [
      scAddress(admin.publicKey()),
      scAddress(CONTRACTS.usdc),
      scI128(10_140n * UNIT),
      scAddress(admin.publicKey()),
    ],
    source: admin,
  });
  steps.push({ step: "deposit", tx: deposit.hash, explorer: explorerTx(deposit.hash || "") });

  const validUntil = Math.floor(Date.now() / 1000) + 180;
  const registered = await invoke({
    contract: CONTRACTS.nectar,
    method: "register_quote",
    args: [
      scAddress(admin.publicKey()),
      quoteSpec({
        borrower,
        maker: admin.publicKey(),
        cashOut: 10_140n * UNIT,
        collateralAmount: 12_000n * UNIT,
        maxDebtRepay: 10_000n * UNIT,
        keeper: admin.publicKey(),
        validUntil,
      }),
    ],
    source: admin,
  });
  const quoteId = String(registered.result || "").replace(/"/g, "");
  steps.push({
    step: "register_quote",
    quoteId,
    tx: registered.hash,
    explorer: explorerTx(registered.hash || ""),
  });

  const preview = await read(CONTRACTS.nectar, "preview_job", [scBytes32(quoteId)]);
  const executed = await invoke({
    contract: CONTRACTS.nectar,
    method: "execute_job",
    args: [scAddress(admin.publicKey()), scBytes32(quoteId)],
    source: admin,
  });
  const job = {
    jobId: `job-${quoteId.slice(0, 8)}`,
    quoteId,
    state: "included",
    tx: executed.hash,
    receipt: executed.result,
    explorer: explorerTx(executed.hash || ""),
    selfOperated: true,
    maker,
  };
  store.jobs.unshift(job);
  return {
    ok: true,
    steps,
    preview,
    job,
    fixtureSum: "10140 = 10000 + 50 + 20 + 70",
    ...freshness(),
  };
}

function errMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
