"use client";

import { useState } from "react";
import { NetworkFilter } from "@/components/AppShell";
import { chainQuery, short, useApi } from "@/lib/useNectar";

export default function MarketsPage() {
  const [filter, setFilter] = useState("all");
  const { data, error } = useApi<{ markets: Array<Record<string, unknown>> }>(`/api/v1/markets${chainQuery(filter)}`);
  return (
    <main className="nc-page">
      <div className="nc-kicker">Markets</div>
      <h1>Monitored and integrated</h1>
      <p className="nc-sub">
        Integrated markets have a Nectar adapter. Monitored markets are visible without an execution
        path. MOCK Morpho Blue is a rehearsal market, not a production lending deployment.
      </p>
      <NetworkFilter value={filter} onChange={setFilter} />
      {error ? <p className="bad">RPC_UNAVAILABLE — last observation not current. {error}</p> : null}
      <div className="nc-card">
        <table className="nc-table">
          <thead>
            <tr>
              <th>Market</th><th>Chain</th><th>Protocol</th><th>Debt / collat</th>
              <th>Price</th><th>Quotes</th><th>Routes</th><th>Unserved</th>
            </tr>
          </thead>
          <tbody>
            {data?.markets?.map((m) => (
              <tr key={String(m.marketKey)}>
                <td>{short(String(m.marketKey))}</td>
                <td>{String(m.chainId)}</td>
                <td>{String(m.protocol)}</td>
                <td>{short(String(m.debtToken || ""))} / {short(String(m.collateralToken || ""))}</td>
                <td className={String(m.priceStatus) === "valid" ? "good" : "warn"}>{String(m.priceStatus)}</td>
                <td>{String(m.activeQuotes)}</td>
                <td>{Array.isArray(m.routes) ? m.routes.join(", ") : "none"}</td>
                <td>{m.unservedAmount == null ? "—" : String(m.unservedAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
