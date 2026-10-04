import snapshot from "@/generated/snapshot.json";
import deployments from "@/generated/deployments.json";

export type Family = "arbitrum" | "robinhood" | "all";

export interface Snapshot {
  exportedAt: string;
  environment: string;
  source: string;
  overview: Record<string, unknown>;
  markets: unknown[];
  quotes: unknown[];
  cashAccounts: unknown[];
  executions: unknown[];
  analytics: Record<string, unknown>;
  networks: unknown[];
}

const bundled = snapshot as unknown as Snapshot;

export function getSnapshot(): Snapshot {
  return bundled;
}

export function getDeployments() {
  return deployments as Array<{
    file: string;
    chainId: number;
    network: string;
    mode?: string;
    contracts: Record<string, string>;
    markets: Record<string, string>;
    publicRpcUrl?: string;
    rpcUrl?: string;
  }>;
}

export function filterByFamily<T extends { family?: string; chainId?: number }>(
  items: T[],
  family: Family,
): T[] {
  if (family === "all") return items;
  return items.filter((i) => i.family === family);
}

export function formatUsd6(amount: string | number | undefined) {
  if (amount === undefined) return "—";
  const n = Number(amount) / 1e6;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export async function tryLive<T>(path: string): Promise<T | null> {
  const base = process.env.NECTAR_API_URL ?? process.env.NEXT_PUBLIC_NECTAR_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, { next: { revalidate: 5 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
