import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICIAL_USDG } from "../../shared/officialDebt.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export type GmxTicker = {
  tokenAddress: string;
  tokenSymbol: string;
  minPrice: string;
  maxPrice: string;
  updatedAt: number | string;
  timestamp: number | string;
};

type GmxCache = {
  fetchedAt: string;
  source: string;
  chain: string;
  tickers: GmxTicker[];
  error: string | null;
};

let gmxCache: { at: number; body: GmxCache } | null = null;

export function officialDebt() {
  return OFFICIAL_USDG;
}

export function robinhoodDeployment() {
  const file = path.join(root, "deployments/robinhood-testnet.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const official = raw.officialDebtAsset as { address?: string; symbol?: string; decimals?: number; name?: string } | undefined;
  return {
    chainId: 46630,
    networkName: "Robinhood Chain testnet",
    audited: false,
    startBlock: raw.startBlock ?? null,
    escrow: raw.escrow ?? null,
    quotes: raw.quotes ?? null,
    executor: raw.executor ?? null,
    rehearsalMarket: raw.rehearsalMarket ?? null,
    debtToken: raw.debtToken ?? null,
    debtSymbol: raw.debtSymbol ?? "nUSD",
    collateralToken: raw.collateralToken ?? null,
    collateralSymbol: raw.collateralSymbol ?? "nSTK",
    pauseGuardian: raw.pauseGuardian ?? null,
    officialDebt: official
      ? {
          address: official.address,
          symbol: official.symbol,
          decimals: official.decimals,
          name: official.name,
          role: "Official Paxos USDG. Not the rehearsal debt token.",
        }
      : null,
    figures: null,
    figuresReason:
      "This API session is not reading chain 46630. Balances are omitted. That is not a zero balance.",
  };
}

export async function gmxReference(): Promise<GmxCache> {
  if (gmxCache && Date.now() - gmxCache.at < 30_000) return gmxCache.body;
  const source = "https://arbitrum-api.gmxinfra.io/prices/tickers";
  try {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`GMX tickers HTTP ${response.status}`);
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("GMX tickers response was not a list.");
    const tickers: GmxTicker[] = body.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        tokenAddress: String(item.tokenAddress ?? ""),
        tokenSymbol: String(item.tokenSymbol ?? ""),
        minPrice: String(item.minPrice ?? ""),
        maxPrice: String(item.maxPrice ?? ""),
        updatedAt: (item.updatedAt as number | string) ?? "",
        timestamp: (item.timestamp as number | string) ?? "",
      };
    });
    const next: GmxCache = {
      fetchedAt: new Date().toISOString(),
      source,
      chain: "Arbitrum One",
      tickers,
      error: null,
    };
    gmxCache = { at: Date.now(), body: next };
    return next;
  } catch (error) {
    const next: GmxCache = {
      fetchedAt: new Date().toISOString(),
      source,
      chain: "Arbitrum One",
      tickers: [],
      error: error instanceof Error ? error.message : "GMX reference unavailable",
    };
    return next;
  }
}
