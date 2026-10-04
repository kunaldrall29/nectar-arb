const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  base: API_BASE,
  overview: () => get<{ data: Overview }>("/v1/overview"),
  markets: () => get<{ data: Market[] }>("/v1/markets"),
  liquidity: (wallet: string) => get<{ data: Liquidity }>(`/v1/accounts/${wallet}/liquidity`),
  receipts: () => get<{ data: Receipt[]; meta: { testnetVolumeUsdEstimate: number } }>("/v1/receipts"),
  networks: () => get<{ data: Network[] }>("/v1/networks"),
  createQuote: (body: Record<string, unknown>) =>
    post<{ data: { quoteId: number; txHash: string; explorer: string } }>("/v1/quotes", body),
  executeJob: (quoteId: number) =>
    post<{ data: { jobId: string; txHash: string; status: string; explorer: string; result: unknown } }>(
      "/v1/jobs",
      { quoteId },
      { "idempotency-key": crypto.randomUUID() },
    ),
};

export type Overview = {
  environment: string;
  deployer: string;
  cashByChain: Array<{
    chain: string;
    asset: string;
    cashDisplay: string;
    reservedDisplay: string;
    availableDisplay: string;
  }>;
  executableOpportunities: number;
  operationalStatus: string;
  traction: {
    stellarGrantUsd: number;
    securityAudit: string;
    testnetVolumeUsd: number;
  };
  contracts: Record<string, string>;
  latestReceipts: Receipt[];
};

export type Market = {
  marketKey: string;
  chainId: string;
  protocol: string;
  integrated: boolean;
  openPositions: Array<{
    positionId: number;
    debt_amount: string;
    collateral_amount: string;
    health_factor_bps: number;
    liquidatable: boolean;
    debtAmountDisplay: string;
    collateralAmountDisplay: string;
    open: boolean;
  }>;
  unservedExposure: string;
};

export type Liquidity = {
  wallet: string;
  cashDisplay: string;
  reservedDisplay: string;
  availableDisplay: string;
  quotes: Array<Record<string, unknown>>;
};

export type Receipt = {
  receiptId: number;
  quoteId: number;
  positionId: number;
  debtRepaid: string;
  collateralSeized: string;
  protocolFee: string;
  surplus: string;
  txHash: string;
  createdAt: string;
};

export type Network = {
  id: string;
  name: string;
  status: string;
  environment: string;
};
