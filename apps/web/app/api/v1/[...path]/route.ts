import { NextRequest, NextResponse } from "next/server";
import { keccak256, toHex, encodeAbiParameters, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  deserializeQuote,
  nectarExecutorAbi,
  quoteDomain,
  QUOTE_TYPES,
  serializeQuote,
} from "@nectar/sdk";
import {
  liquidityPayload,
  marketsPayload,
  networkPayload,
  quotesPayload,
  receiptsPayload,
  sync,
} from "@/lib/indexer";
import { deploymentFor } from "@/lib/config";
import { publicClient } from "@/lib/clients";
import {
  addAlert,
  addQuoteRequest,
  getChallenge,
  getIdem,
  getJob,
  listAlerts,
  listJobs,
  listQuoteRequests,
  putChallenge,
  putJob,
  setIdem,
} from "@/lib/store";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function idemKey(req: NextRequest) {
  return req.headers.get("idempotency-key") || req.headers.get("Idempotency-Key");
}

function checkIdem(req: NextRequest, body: unknown) {
  const key = idemKey(req);
  if (!key) return { error: json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, 400) };
  const prev = getIdem(key);
  if (prev) {
    const same = JSON.stringify(prev.body) === JSON.stringify(body);
    if (!same) return { error: json({ error: "IDEMPOTENCY_CONFLICT" }, 409) };
    return { replay: json(prev.hash ? { replay: true, result: prev.hash } : prev, prev.status) };
  }
  return { key };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const p = path.join("/");
  const url = new URL(req.url);
  const chainId = url.searchParams.get("chainId")
    ? Number(url.searchParams.get("chainId"))
    : undefined;
  const format = url.searchParams.get("format");

  try {
    if (p === "networks") return json(await networkPayload());
    if (p === "markets") return json(await marketsPayload(chainId));
    if (p.startsWith("markets/")) {
      const marketKey = p.slice("markets/".length);
      const all = await marketsPayload(chainId);
      const market = all.markets.find((m) => m.marketKey === marketKey);
      if (!market) return json({ error: "NOT_FOUND" }, 404);
      return json({ market, freshness: all.freshness });
    }
    if (p.startsWith("accounts/") && p.endsWith("/liquidity")) {
      const wallet = p.split("/")[1] as `0x${string}`;
      return json(await liquidityPayload(wallet, chainId));
    }
    if (p.startsWith("quotes/")) {
      const quoteId = p.slice("quotes/".length);
      const all = await quotesPayload(chainId);
      const quote = all.quotes.find((q) => q.quoteId === quoteId);
      if (!quote) return json({ error: "NOT_FOUND", quoteId }, 404);
      return json({ quote, freshness: all.freshness });
    }
    if (p.startsWith("jobs/")) {
      const jobId = p.slice("jobs/".length);
      const job = getJob(jobId);
      if (!job) return json({ error: "NOT_FOUND" }, 404);
      return json({ job });
    }
    if (p === "receipts") {
      const data = await receiptsPayload(chainId);
      if (format === "csv") {
        const header =
          "chainId,jobId,quoteId,borrower,debtRepaid,collateralDelivered,keeperCompensation,protocolFee,surplus,writeoff,txHash,blockNumber,finality";
        const rows = data.receipts.map((r) =>
          [
            r.chainId,
            r.jobId,
            r.quoteId,
            r.borrower,
            r.debtRepaid,
            r.collateralDelivered,
            r.keeperCompensation,
            r.protocolFee,
            r.surplus,
            r.writeoff,
            r.txHash,
            r.blockNumber,
            r.finality,
          ].join(","),
        );
        return new NextResponse([header, ...rows].join("\n"), {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": "attachment; filename=nectar-receipts.csv",
          },
        });
      }
      return json(data);
    }
    if (p === "alerts") return json({ alerts: listAlerts() });
    if (p === "quoteRequests") return json({ quoteRequests: listQuoteRequests() });
    if (p === "jobs") return json({ jobs: listJobs() });
    if (p === "quotes") return json(await quotesPayload(chainId));
    if (p === "health") return json({ ok: true, service: "nectar-api", ts: new Date().toISOString() });
    return json({ error: "NOT_FOUND", path: p }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "RPC_UNAVAILABLE";
    return json({ error: "RPC_UNAVAILABLE", message, freshness: new Date().toISOString() }, 503);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const p = path.join("/");
  const body = await req.json().catch(() => ({}));

  if (p === "auth/challenge") {
    const wallet = String(body.wallet || "").toLowerCase();
    const nonce = keccak256(toHex(`${wallet}:${Date.now()}:${Math.random()}`));
    putChallenge(wallet, nonce, Date.now() + 10 * 60_000);
    return json({
      domain: process.env.SIWE_DOMAIN || "nectar.local",
      nonce,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      statement: "Sign in to Nectar. This session cannot move funds.",
    });
  }
  if (p === "auth/verify") {
    const wallet = String(body.wallet || "").toLowerCase();
    const ch = getChallenge(wallet);
    if (!ch || ch.exp < Date.now() || ch.nonce !== body.nonce) {
      return json({ error: "CHALLENGE_INVALID" }, 401);
    }
    return json({ ok: true, session: "prototype", wallet, note: "Session only — not spending authority" });
  }

  const gate = checkIdem(req, body);
  if ("error" in gate && gate.error) return gate.error;
  if ("replay" in gate && gate.replay) return gate.replay;
  const key = "key" in gate ? gate.key : undefined;

  if (p === "quoteRequests") {
    const rec = addQuoteRequest({
      id: keccak256(toHex(JSON.stringify(body) + Date.now())),
      body,
      createdAt: new Date().toISOString(),
    });
    if (key) setIdem(key, { hash: rec.id, body, status: 200, at: Date.now() });
    return json({ quoteRequest: rec });
  }

  if (p === "quotes") {
    const chainId = Number(body.chainId);
    const d = deploymentFor(chainId);
    if (!d?.addresses?.escrow) return json({ error: "UNSUPPORTED_MARKET" }, 400);
    const quote = deserializeQuote(body.quote);
    const typed = {
      domain: quoteDomain(chainId, d.addresses.escrow),
      types: QUOTE_TYPES,
      primaryType: "Quote" as const,
      message: quote,
    };
    const registration = {
      to: d.addresses.escrow,
      method: "registerQuote",
      chainId,
      verifyingContract: d.addresses.escrow,
    };
    const id = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [quote.reservationId, quote.quoteNonce]),
    );
    if (key) setIdem(key, { hash: id, body, status: 200, at: Date.now() });
    return json({
      quoteId: id,
      quote: serializeQuote(quote),
      eip712: typed,
      registration,
      note: "Signature is not capacity. Quote is executable only after onchain registration.",
    });
  }

  if (p === "jobs/preview") {
    const chainId = Number(body.chainId);
    const d = deploymentFor(chainId);
    if (!d?.addresses?.executor) return json({ error: "UNSUPPORTED_MARKET", reason: "QUOTE_NOT_FUNDED" }, 400);
    const client = publicClient(chainId);
    try {
      const result = await client.readContract({
        address: d.addresses.executor,
        abi: nectarExecutorAbi,
        functionName: "previewJob",
        args: [body.job, deserializeQuote(body.quote), body.route],
      });
      const r = result as {
        ok: boolean;
        reason: `0x${string}`;
        expectedDebtRepay: bigint;
        expectedCollateral: bigint;
        keeperCompensation: bigint;
        protocolFee: bigint;
        surplus: bigint;
        ammEstimate: bigint;
      };
      return json({
        ok: r.ok,
        reason: r.reason,
        expectedDebtRepay: r.expectedDebtRepay.toString(),
        expectedCollateral: r.expectedCollateral.toString(),
        keeperCompensation: r.keeperCompensation.toString(),
        protocolFee: r.protocolFee.toString(),
        surplus: r.surplus.toString(),
        ammEstimate: r.ammEstimate.toString(),
        sourceBlock: (await client.getBlockNumber()).toString(),
        freshness: new Date().toISOString(),
      });
    } catch (e) {
      return json({
        ok: false,
        reason: "RPC_UNAVAILABLE",
        message: e instanceof Error ? e.message : "preview failed",
      }, 503);
    }
  }

  if (p === "jobs") {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (token !== (process.env.KEEPER_API_TOKEN || "dev-keeper-token")) {
      return json({ error: "UNAUTHORIZED_KEEPER" }, 401);
    }
    const chainId = Number(body.chainId);
    const d = deploymentFor(chainId);
    const pk = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;
    if (!d?.addresses?.executor || !pk) {
      return json({ error: "KEEPER_NOT_CONFIGURED" }, 503);
    }
    const account = privateKeyToAccount(pk);
    const { createWalletClient, http } = await import("viem");
    const wallet = createWalletClient({ account, transport: http(d.rpc) });
    const jobId = keccak256(toHex(JSON.stringify(body.job) + Date.now()));
    try {
      const hash = await wallet.writeContract({
        chain: null,
        address: d.addresses.executor,
        abi: nectarExecutorAbi,
        functionName: "executeJob",
        args: [body.job, deserializeQuote(body.quote), body.route],
      });
      const rec = putJob({
        jobId,
        chainId,
        txHash: hash,
        state: "submitted",
        createdAt: new Date().toISOString(),
        quoteId: body.job?.quoteId,
      });
      if (key) setIdem(key, { hash, body, status: 200, at: Date.now() });
      return json({ job: rec });
    } catch (e) {
      const rec = putJob({
        jobId,
        chainId,
        state: "rejected",
        reason: e instanceof Error ? e.message : "revert",
        createdAt: new Date().toISOString(),
      });
      return json({ job: rec }, 400);
    }
  }

  if (p === "alerts") {
    const rec = addAlert({
      id: keccak256(toHex(JSON.stringify(body) + Date.now())),
      channel: String(body.channel || "workspace"),
      wallet: body.wallet,
      createdAt: new Date().toISOString(),
    });
    if (key) setIdem(key, { hash: rec.id, body, status: 200, at: Date.now() });
    return json({ alert: rec, note: "In-memory workspace stub" });
  }

  if (p === "demo/rehearse") {
    if (process.env.ALLOW_DEMO_SIGNER !== "true") {
      return json({ error: "DEMO_SIGNER_DISABLED" }, 403);
    }
    await sync(Number(body.chainId || 31337));
    return json({ ok: true, note: "Use scripts/demo-local.sh for the full rehearsal." });
  }

  return json({ error: "NOT_FOUND", path: p }, 404);
}
