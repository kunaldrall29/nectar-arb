"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { useNetworkFilter } from "@/components/NetworkFilter";
import { filterByFamily, formatUsd6 } from "@/lib/data";

export default function OverviewPage() {
  const { family } = useNetworkFilter();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [execs, setExecs] = useState<unknown[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, unknown>>({});

  useEffect(() => {
    void fetch("/api/overview").then((r) => r.json()).then(setData);
    void fetch("/api/executions").then((r) => r.json()).then((d) => setExecs(d.executions ?? []));
    void fetch("/api/analytics").then((r) => r.json()).then(setAnalytics);
  }, []);

  const filtered = filterByFamily(
    execs as { family?: string }[],
    family === "all" ? "all" : family,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-slate-400">
          Unified workspace for mock testnet liquidations. Funds stay on each chain — filters only change what you see.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Networks" value={String(data?.networks ?? "—")} hint="Arbitrum Sepolia + Robinhood testnet configs" />
        <StatCard label="Active quotes" value={String(data?.activeQuotes ?? "—")} />
        <StatCard
          label="Measured volume"
          value={formatUsd6(String(analytics.volumeDebtToken6 ?? "0"))}
          hint={`${analytics.label ?? "testnet"} · snapshot ${String(data?.environment ?? "TESTNET")}`}
        />
        <StatCard label="Executions" value={String(filtered.length)} hint="Filtered by network tab" />
      </div>
      <section className="rounded-xl border border-nectar-border bg-nectar-panel p-4">
        <h2 className="text-sm font-medium text-slate-300">Operational status</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-400">
          <li>Scope: mock Morpho-like market, permissionless mint test tokens, labeled TESTNET.</li>
          <li>Keeper jobs are durable in SQLite — restarts recover in-flight transactions.</li>
          <li>
            Data source:{" "}
            <span className="text-amber-300/90">
              {process.env.NEXT_PUBLIC_NECTAR_API_URL ? "live API with snapshot fallback" : "bundled snapshot from last local seed"}
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
