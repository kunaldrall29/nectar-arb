"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { NetworkFilter } from "@/components/AppShell";
import { chainQuery, short, units, useApi } from "@/lib/useNectar";

export default function OverviewPage() {
  const [filter, setFilter] = useState("all");
  const { address } = useAccount();
  const nets = useApi<{ networks: Array<Record<string, unknown>>; freshness: string }>("/api/v1/networks");
  const markets = useApi<{ markets: Array<Record<string, unknown>> }>(`/api/v1/markets${chainQuery(filter)}`);
  const liq = useApi<{ accounts: Array<Record<string, string>> }>(
    address ? `/api/v1/accounts/${address}/liquidity${chainQuery(filter)}` : "/api/v1/health",
  );
  const receipts = useApi<{ receipts: Array<Record<string, string>> }>(`/api/v1/receipts${chainQuery(filter)}`);

  const cash = Array.isArray(liq.data?.accounts) ? liq.data.accounts : [];
  const reserved = cash.reduce((s, a) => s + Number(a.reserved || 0), 0);
  const execs = markets.data?.markets?.filter((m) => m.executableNow).length || 0;

  return (
    <main className="nc-page">
      <div className="nc-kicker">Overview</div>
      <h1>Workspace</h1>
      <p className="nc-sub">
        Cash, reservations and opportunities by chain. Combined dollar figures below are secondary
        estimates, timestamped, and never used as a spendable balance.
      </p>
      <NetworkFilter value={filter} onChange={setFilter} />
      <div className="nc-grid cols-4">
        <div className="nc-card">
          <h3>Maker cash</h3>
          <div className="nc-kpi">{cash.length ? units(cash[0]?.deposited) : address ? "0" : "—"}</div>
          <p className="nc-sub">Onchain escrow, selected wallet.</p>
        </div>
        <div className="nc-card">
          <h3>Reserved</h3>
          <div className="nc-kpi">{reserved ? reserved : "0"}</div>
          <p className="nc-sub">Unconsumed, unreleased quotes. Expired cash stays reserved until release.</p>
        </div>
        <div className="nc-card">
          <h3>Executable now</h3>
          <div className="nc-kpi">{execs}</div>
          <p className="nc-sub">Unhealthy MOCK positions with an active funded quote.</p>
        </div>
        <div className="nc-card">
          <h3>Ops</h3>
          <div className="nc-kpi">{nets.error ? "DEGRADED" : "LIVE"}</div>
          <p className="nc-sub">Observed {nets.data?.freshness || "—"}. {nets.error || "RPC reads on request."}</p>
        </div>
      </div>
      <div className="nc-grid cols-2" style={{ marginTop: 16 }}>
        <div className="nc-card">
          <h3>Networks</h3>
          <table className="nc-table">
            <thead>
              <tr><th>Network</th><th>Status</th><th>Block</th></tr>
            </thead>
            <tbody>
              {nets.data?.networks?.map((n) => (
                <tr key={String(n.chainId)}>
                  <td>{String(n.name)}</td>
                  <td className={String(n.status) === "live" ? "good" : "warn"}>{String(n.status)}</td>
                  <td>{String(n.sourceBlock || "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="nc-card">
          <h3>Recent settlements</h3>
          <table className="nc-table">
            <thead>
              <tr><th>Tx</th><th>Debt repaid</th><th>Finality</th></tr>
            </thead>
            <tbody>
              {receipts.data?.receipts?.length ? receipts.data.receipts.slice(0, 6).map((r) => (
                <tr key={r.txHash}>
                  <td>{short(r.txHash)}</td>
                  <td>{units(r.debtRepaid)}</td>
                  <td>{r.finality}</td>
                </tr>
              )) : <tr><td colSpan={3}>No canonical settlements indexed yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
