"use client";

import { useEffect, useState } from "react";
import { apiGet, type Receipt } from "@/lib/api";

export default function ExecutionsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<{ receipts: Receipt[] }>("/v1/receipts")
      .then((body) => setReceipts(body.receipts))
      .catch((err: Error) => setError(err.message));
  }, []);
  return (
    <>
      <h1>Executions</h1>
      <p className="lede">Receipts from this chain. Amounts are integer base units.</p>
      {error ? <p className="reason">{error}</p> : null}
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Tx</th>
              <th>Route</th>
              <th>Debt repaid</th>
              <th>Keeper</th>
              <th>Protocol</th>
              <th>Surplus</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.txHash}>
                <td className="mono">{receipt.txHash?.slice(0, 10)}…</td>
                <td>{receipt.route === "1" ? "quote" : receipt.route === "2" ? "propAMM" : receipt.route}</td>
                <td>{receipt.debtRepaid}</td>
                <td>{receipt.keeperCompensation}</td>
                <td>{receipt.protocolFee}</td>
                <td>{receipt.surplus ?? "—"}</td>
              </tr>
            ))}
            {receipts.length === 0 && !error ? (
              <tr>
                <td colSpan={6}>No executions yet. Run the funded-quote or propAMM scenario.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
