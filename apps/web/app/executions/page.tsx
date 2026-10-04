"use client";

import { useState } from "react";
import { NetworkFilter } from "@/components/AppShell";
import { chainQuery, short, units, useApi } from "@/lib/useNectar";

export default function ExecutionsPage() {
  const [filter, setFilter] = useState("all");
  const receipts = useApi<{ receipts: Array<Record<string, string>> }>(`/api/v1/receipts${chainQuery(filter)}`);
  const jobs = useApi<{ jobs: Array<Record<string, string>> }>("/api/v1/jobs");
  return (
    <main className="nc-page">
      <div className="nc-kicker">Executions</div>
      <h1>Jobs and receipts</h1>
      <p className="nc-sub">
        Wallet rejection is not a failed liquidation. States: awaiting signature, submitted, included,
        finalized, reverted, replaced, reorged. Finality here is labeled <span className="mono">L2_included</span> — not Ethereum finality.
      </p>
      <NetworkFilter value={filter} onChange={setFilter} />
      <div className="nc-card" style={{ marginBottom: 16 }}>
        <h3>Indexed settlements</h3>
        <table className="nc-table">
          <thead>
            <tr>
              <th>Tx</th><th>Debt repaid</th><th>Collateral</th><th>Keeper</th><th>Protocol</th><th>Surplus</th><th>Finality</th>
            </tr>
          </thead>
          <tbody>
            {receipts.data?.receipts?.length ? receipts.data.receipts.map((r) => (
              <tr key={r.txHash}>
                <td>
                  {r.chainId === "421614" ? (
                    <a href={`https://sepolia.arbiscan.io/tx/${r.txHash}`} target="_blank" rel="noreferrer">{short(r.txHash)}</a>
                  ) : short(r.txHash)}
                </td>
                <td>{units(r.debtRepaid)}</td>
                <td>{r.collateralDelivered}</td>
                <td>{units(r.keeperCompensation)}</td>
                <td>{units(r.protocolFee)}</td>
                <td>{units(r.surplus)}</td>
                <td className="good">{r.finality}</td>
              </tr>
            )) : <tr><td colSpan={7}>No included settlements yet.</td></tr>}
          </tbody>
        </table>
        <p className="nc-sub" style={{ marginTop: 10 }}>
          <a href={`/api/v1/receipts${chainQuery(filter)}&format=csv`.replace("?&", "?")}>Export CSV</a>
          {" · "}
          <a href={`/api/v1/receipts${chainQuery(filter)}`}>Export JSON</a>
        </p>
      </div>
      <div className="nc-card">
        <h3>Operator jobs</h3>
        <table className="nc-table">
          <thead><tr><th>Job</th><th>State</th><th>Tx</th><th>Reason</th></tr></thead>
          <tbody>
            {jobs.data?.jobs?.length ? jobs.data.jobs.map((j) => (
              <tr key={j.jobId}>
                <td>{short(j.jobId)}</td>
                <td>{j.state}</td>
                <td>{short(j.txHash)}</td>
                <td>{j.reason || "—"}</td>
              </tr>
            )) : <tr><td colSpan={4}>No keeper-submitted jobs in this process.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
