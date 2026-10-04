"use client";

import { useEffect, useState } from "react";
import { formatUsd6 } from "@/lib/data";

export default function AnalyticsPage() {
  const [a, setA] = useState<Record<string, unknown>>({});

  useEffect(() => {
    void fetch("/api/analytics").then((r) => r.json()).then(setA);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <p className="text-sm text-slate-400">Testnet-measured outcomes only — not production revenue.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-nectar-border bg-nectar-panel p-4">
          <p className="text-xs text-slate-500">Execution count</p>
          <p className="text-3xl font-semibold">{String(a.executionCount ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-nectar-border bg-nectar-panel p-4">
          <p className="text-xs text-slate-500">Volume (debt token)</p>
          <p className="text-3xl font-semibold">{formatUsd6(String(a.volumeDebtToken6 ?? "0"))}</p>
        </div>
        <div className="rounded-xl border border-nectar-border bg-nectar-panel p-4">
          <p className="text-xs text-slate-500">Surplus to operators</p>
          <p className="text-3xl font-semibold">{formatUsd6(String(a.totalSurplus6 ?? "0"))}</p>
        </div>
        <div className="rounded-xl border border-nectar-border bg-nectar-panel p-4">
          <p className="text-xs text-slate-500">Active quotes</p>
          <p className="text-3xl font-semibold">{String(a.activeQuotes ?? 0)}</p>
        </div>
      </div>
      <p className="text-xs text-slate-600">{String(a.selfOperatedNote ?? "")}</p>
    </div>
  );
}
