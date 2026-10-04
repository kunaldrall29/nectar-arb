import { db } from "./db.js";
import { eventsByName } from "./indexer.js";
import type { Family } from "./config.js";
import { familyOf } from "./config.js";

export interface MarketView {
  network: string;
  chainId: number;
  family: Family;
  marketKey: string;
  symbol: string;
  admitted: boolean;
  policyHash?: string;
  activeQuotes: number;
  reservedCash: string;
  lastEventAt?: number;
}

export interface QuoteView {
  quoteId: string;
  network: string;
  chainId: number;
  family: Family;
  maker: string;
  marketKey: string;
  borrower: string;
  debtToken: string;
  cashOut: string;
  collateralAmount: string;
  maxDebtRepay: string;
  validUntil: number;
  status: "Active" | "Consumed" | "Released" | "Expired";
  txHash: string;
  blockTime?: number;
}

export interface CashAccountView {
  network: string;
  chainId: number;
  maker: string;
  token: string;
  deposited: string;
  reserved: string;
  available: string;
}

export interface ExecutionView {
  jobId?: string;
  quoteId: string;
  network: string;
  chainId: number;
  family: Family;
  marketKey?: string;
  maker?: string;
  keeper?: string;
  repaidAssets?: string;
  collateralAmount?: string;
  cashOut?: string;
  surplus?: string;
  txHash: string;
  blockNumber: number;
  blockTime?: number;
  state: string;
}

function marketSymbol(network: string, marketKey: string): string {
  if (marketKey.toLowerCase().includes("tsla") || network.includes("421614")) return "mTSLA";
  const rows = db
    .prepare(`SELECT args FROM events WHERE network = ? AND event_name = 'PolicyActivated' LIMIT 5`)
    .all(network) as { args: string }[];
  for (const r of rows) {
    const a = JSON.parse(r.args);
    if (a.marketKey === marketKey) return "mNVDA";
  }
  return marketKey.slice(0, 10);
}

export function listMarkets(network?: string): MarketView[] {
  const activated = eventsByName(network ?? null, ["PolicyActivated"]);
  const quotes = eventsByName(network ?? null, ["QuoteReserved"]);
  const byKey = new Map<string, MarketView>();

  for (const e of activated) {
    const key = e.a.marketKey as string;
    byKey.set(`${e.network}:${key}`, {
      network: e.network,
      chainId: e.chain_id,
      family: familyOf(e.chain_id),
      marketKey: key,
      symbol: key === e.a.marketKey ? marketSymbol(e.network, key) : "market",
      admitted: true,
      policyHash: e.a.policyHash as string,
      activeQuotes: 0,
      reservedCash: "0",
      lastEventAt: e.block_time ?? undefined,
    });
  }

  for (const e of quotes) {
    const key = e.a.marketKey as string;
    const id = `${e.network}:${key}`;
    let m = byKey.get(id);
    if (!m) {
      m = {
        network: e.network,
        chainId: e.chain_id,
        family: familyOf(e.chain_id),
        marketKey: key,
        symbol: marketSymbol(e.network, key),
        admitted: true,
        activeQuotes: 0,
        reservedCash: "0",
      };
      byKey.set(id, m);
    }
    const consumed = eventsByName(e.network, ["QuoteConsumed"]).some((c) => c.a.quoteId === e.a.quoteId);
    const released = eventsByName(e.network, ["QuoteReleased"]).some((c) => c.a.quoteId === e.a.quoteId);
    const now = Math.floor(Date.now() / 1000);
    const active = !consumed && !released && Number(e.a.validUntil) > now;
    if (active) {
      m.activeQuotes += 1;
      m.reservedCash = (BigInt(m.reservedCash) + BigInt(e.a.cashOut)).toString();
    }
    if (e.block_time) m.lastEventAt = Math.max(m.lastEventAt ?? 0, e.block_time);
  }

  return [...byKey.values()].sort((a, b) => a.network.localeCompare(b.network));
}

export function listQuotes(network?: string, status?: string): QuoteView[] {
  const reserved = eventsByName(network ?? null, ["QuoteReserved"]);
  const consumed = new Set(eventsByName(network ?? null, ["QuoteConsumed"]).map((e) => e.a.quoteId as string));
  const released = new Set(eventsByName(network ?? null, ["QuoteReleased"]).map((e) => e.a.quoteId as string));
  const now = Math.floor(Date.now() / 1000);

  return reserved.map((e) => {
    let st: QuoteView["status"] = "Active";
    if (consumed.has(e.a.quoteId)) st = "Consumed";
    else if (released.has(e.a.quoteId)) st = "Released";
    else if (Number(e.a.validUntil) <= now) st = "Expired";
    return {
      quoteId: e.a.quoteId,
      network: e.network,
      chainId: e.chain_id,
      family: familyOf(e.chain_id),
      maker: e.a.maker,
      marketKey: e.a.marketKey,
      borrower: e.a.borrower,
      debtToken: e.a.debtToken,
      cashOut: String(e.a.cashOut),
      collateralAmount: String(e.a.collateralAmount),
      maxDebtRepay: String(e.a.maxDebtRepay),
      validUntil: Number(e.a.validUntil),
      status: st,
      txHash: e.tx_hash,
      blockTime: e.block_time ?? undefined,
    };
  }).filter((q) => !status || q.status === status);
}

export function listCashAccounts(network?: string): CashAccountView[] {
  const map = new Map<string, CashAccountView>();
  const touch = (network: string, chainId: number, maker: string, token: string) => {
    const k = `${network}:${maker}:${token}`;
    if (!map.has(k)) {
      map.set(k, { network, chainId, maker, token, deposited: "0", reserved: "0", available: "0" });
    }
    return map.get(k)!;
  };

  for (const e of eventsByName(network ?? null, ["CashDeposited"])) {
    const a = touch(e.network, e.chain_id, e.a.maker, e.a.token);
    a.deposited = (BigInt(a.deposited) + BigInt(e.a.amount)).toString();
  }
  for (const e of eventsByName(network ?? null, ["CashWithdrawn"])) {
    const a = touch(e.network, e.chain_id, e.a.maker, e.a.token);
    a.deposited = (BigInt(a.deposited) - BigInt(e.a.amount)).toString();
  }
  for (const e of eventsByName(network ?? null, ["CashReserved"])) {
    const a = touch(e.network, e.chain_id, e.a.maker, e.a.token);
    a.reserved = (BigInt(a.reserved) + BigInt(e.a.amount)).toString();
  }
  for (const e of eventsByName(network ?? null, ["CashReleased", "CashConsumed"])) {
    const a = touch(e.network, e.chain_id, e.a.maker, e.a.token);
    a.reserved = (BigInt(a.reserved) - BigInt(e.a.amount)).toString();
  }
  for (const a of map.values()) {
    a.available = (BigInt(a.deposited) - BigInt(a.reserved)).toString();
  }
  return [...map.values()].sort((a, b) => a.maker.localeCompare(b.maker));
}

export function listExecutions(network?: string): ExecutionView[] {
  const settled = eventsByName(network ?? null, ["LiquidationSettled"]);
  const jobs = db
    .prepare(network ? "SELECT * FROM jobs WHERE network = ?" : "SELECT * FROM jobs")
    .all(...(network ? [network] : [])) as {
    job_id: string;
    quote_id: string;
    network: string;
    chain_id: number;
    state: string;
    tx_hash: string | null;
  }[];

  const execs: ExecutionView[] = settled.map((e) => {
    const s = e.a.settlement ?? e.a[3] ?? e.a;
    return {
      jobId: e.a.jobId,
      quoteId: e.a.quoteId,
      network: e.network,
      chainId: e.chain_id,
      family: familyOf(e.chain_id),
      marketKey: e.a.marketKey,
      maker: s.maker,
      keeper: s.keeper,
      repaidAssets: String(s.repaidAssets),
      collateralAmount: String(s.collateralAmount),
      cashOut: String(s.cashOut),
      surplus: String(s.surplus),
      txHash: e.tx_hash,
      blockNumber: e.block_number,
      blockTime: e.block_time ?? undefined,
      state: "Finalized",
    };
  });

  for (const j of jobs) {
    if (execs.some((x) => x.quoteId === j.quote_id)) continue;
    if (!j.tx_hash) continue;
    execs.push({
      quoteId: j.quote_id,
      network: j.network,
      chainId: j.chain_id,
      family: familyOf(j.chain_id),
      txHash: j.tx_hash,
      blockNumber: 0,
      state: j.state,
      jobId: j.job_id,
    });
  }
  return execs.sort((a, b) => b.blockNumber - a.blockNumber);
}

export function analyticsSummary(network?: string) {
  const execs = listExecutions(network);
  let volume = 0n;
  let surplus = 0n;
  for (const e of execs) {
    if (e.cashOut) volume += BigInt(e.cashOut);
    if (e.surplus) surplus += BigInt(e.surplus);
  }
  const quotes = listQuotes(network).filter((q) => q.status === "Active");
  return {
    label: "testnet_measured",
    executionCount: execs.length,
    volumeDebtToken6: volume.toString(),
    volumeUsdEstimate: (Number(volume) / 1e6).toFixed(2),
    totalSurplus6: surplus.toString(),
    activeQuotes: quotes.length,
    selfOperatedNote: "Demo seed uses known anvil keys; identify in exports.",
  };
}
