"use client";

import { useState } from "react";
import { NetworkFilter } from "@/components/AppShell";
import { chainQuery, units, useApi } from "@/lib/useNectar";

export default function AnalyticsPage() {
  const [filter, setFilter] = useState("all");
  const receipts = useApi<{ receipts: Array<Record<string, string>> }>(`/api/v1/receipts${chainQuery(filter)}`);
  const markets = useApi<{ markets: Array<Record<string, string>> }>(`/api/v1/markets${chainQuery(filter)}`);
  const measured = receipts.data?.receipts || [];
  const debt = measured.reduce((s, r) => s + Number(r.debtRepaid || 0), 0);
  const fees = measured.reduce((s, r) => s + Number(r.protocolFee || 0), 0);
  const amm = markets.data?.markets?.[0]?.ammEstimate;
  return (
    <main className="nc-page">
      <div className="nc-kicker">Analytics · testnet</div>
      <h1>Measured vs estimates</h1>
      <p className="nc-sub">
        Measured amounts come from LiquidationSettled events. AMM figures are estimates from the
        comparison path. Self-operated maker and keeper wallets are identifiable in FUNDING.md.
      </p>
      <NetworkFilter value={filter} onChange={setFilter} />
      <div className="nc-grid cols-3">
        <div className="nc-card">
          <h3>Measured recovered debt</h3>
          <div className="nc-kpi">{measured.length ? units(String(debt)) : "0"}</div>
          <p className="nc-sub">Sum of actual debtRepaid on indexed receipts.</p>
        </div>
        <div className="nc-card">
          <h3>Measured protocol fees</h3>
          <div className="nc-kpi">{measured.length ? units(String(fees)) : "0"}</div>
          <p className="nc-sub">Realized only after fee transfers. Not maker inventory marks.</p>
        </div>
        <div className="nc-card">
          <h3>AMM estimate (same fixture)</h3>
          <div className="nc-kpi">{amm ? units(String(amm)) : "—"}</div>
          <p className="nc-sub">Section 9 comparison path. Not a quote and not spendable.</p>
        </div>
      </div>
      <div className="nc-card" style={{ marginTop: 16 }}>
        <h3>What this is not</h3>
        <p className="nc-sub">
          Traction lines used in the founder demo (Stellar grant, audit, $148k+ testnet volume) are
          company narrative. They are not rendered here as live product metrics.
        </p>
      </div>
    </main>
  );
}
