"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Record<string, unknown>[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch(`${API_URL}/v1/markets`).then((r) => r.json()).then((j) => setMarkets(j.data ?? []));
  }, []);

  const filtered = markets.filter((m) => filter === "all" || String(m.chainId) === filter);

  return (
    <div>
      <h1>Markets</h1>
      <p className="muted">Integrated vs monitored. No route is a valid state with explanation.</p>
      <div style={{ marginBottom: 1 }}>
        <label htmlFor="net">Network filter</label>
        <select id="net" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginLeft: 0.5 }}>
          <option value="all">All networks</option>
          <option value="421614">Arbitrum Sepolia</option>
          <option value="46630">Robinhood Chain Testnet (planned)</option>
        </select>
      </div>
      <div className="grid" style={{ gap: "0.75rem" }}>
        {filtered.map((m) => (
          <div key={String(m.marketKey)} className="card">
            <strong>{m.protocol as string}</strong>
            <div className="muted">Chain {m.chainId as number} · {m.status as string}</div>
            <div style={{ fontSize: 0.85 }}>Debt {m.debtToken as string}</div>
          </div>
        ))}
        {filter === "46630" && (
          <div className="card">
            <strong>Robinhood stock-collateral markets</strong>
            <p className="muted">Admission pending pinned USDG and oracle fixtures. Execution unavailable until admitted.</p>
          </div>
        )}
      </div>
    </div>
  );
}
