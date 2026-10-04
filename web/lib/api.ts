export type Freshness = "live" | "stale" | "unavailable";

export type WorkspaceResponse = {
  meta: {
    environment: string;
    scope: string;
    audited: boolean;
    freshness: Freshness;
    chainId: number;
    blockNumber: string | null;
    observedAt: string | null;
    label: string;
    error: string | null;
  };
  workspace: null | {
    blockNumber: string;
    observedAt: string;
    paused: boolean;
    liabilities: string;
    market: Market;
    quotes: Quote[];
    receipts: Receipt[];
    liquidity: Liquidity | null;
  };
  jobs: Job[];
};

export type Market = {
  marketKey: string;
  label: string;
  protocol: string;
  protocolNote: string;
  chainId: number;
  debtSymbol: string;
  debtDecimals: number;
  collateralSymbol: string;
  collateralDecimals: number;
  debtToken: string;
  collateralToken: string;
  price: string;
  priceStatus: "fresh" | "unavailable" | "stale";
  lltvBps: string;
  bonusBps: string;
  positions: Position[];
  quoteCount: number;
  routes: string[];
  ammRoute: null;
  unservedDebt: string;
  executableDebt: string;
};

export type Position = {
  borrower: string;
  collateral: string;
  debt: string;
  liquidatable: boolean;
  collateralValue: string;
  maxBorrow: string;
  seizure: string | null;
};

export type Quote = {
  reservationId: string;
  maker: string;
  borrower: string;
  cashOut: string;
  collateralAmount: string;
  maxDebtRepay: string;
  keeperCompensation: string;
  protocolFee: string;
  minNetSurplus: string;
  validUntil: string;
  status: string;
  collateralRecipient: string;
  keeperRecipient: string;
};

export type Receipt = {
  chainId: number;
  txHash: string;
  blockNumber: number;
  finality: string;
  reservationId: string;
  maker: string;
  borrower: string;
  debtRepaid: string;
  collateralDelivered: string;
  keeperCompensation: string;
  protocolFee: string;
  surplus: string;
  writeoff: string;
};

export type Liquidity = {
  wallet: string;
  symbol: string;
  decimals: number;
  collateralSymbol: string;
  collateralDecimals: number;
  walletDebt: string;
  walletCollateral: string;
  cash: string;
  reserved: string;
  available: string;
};

export type Job = {
  id: string;
  kind: string;
  status: string;
  txHash: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type Plan = {
  network: { name: string; chainId: number; warning?: string };
  asset: string;
  amount?: string;
  decimals?: number;
  destination: string;
  destinationLabel: string;
  expiry: string | null;
  fee: string;
  notes?: string[];
  preview?: { ok: boolean; reason: string };
  collateralAmount?: string;
  borrower?: string;
  available?: string;
  reserved?: string;
};

const base = "";

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message ?? "Request failed");
  }
  return body as T;
}

export async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? "Request failed") as Error & { code?: string };
    error.code = body?.error?.code;
    throw error;
  }
  return body as T;
}
