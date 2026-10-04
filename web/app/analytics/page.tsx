"use client";

import { useEffect, useState } from "react";
import { apiGet, type Receipt } from "@/lib/api";

export default function AnalyticsPage() {
  const [body, setBody] = useState<{ count: number; label: string; receipts: Receipt[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<{ count: number; label: string; receipts: Receipt[] }>("/v1/analytics")
      .then(setBody)
      .catch((err: Error) => setError(err.message));
  }, []);
  const repaid = (body?.receipts ?? []).reduce((sum, receipt) => sum + Number(receipt.debtRepaid ?? 0), 0);
  return (
    <>
      <h1>Analytics</h1>
      <p className="lede">{body?.label ?? "Indexed lab settlements only."}</p>
      {error ? <p className="reason">{error}</p> : null}
      <div className="grid stats">
        <section className="panel">
          <div className="kicker">Settlements</div>
          <div className="figure">{body ? body.count : "—"}</div>
        </section>
        <section className="panel">
          <div className="kicker">Debt repaid, base units</div>
          <div className="figure">{body ? repaid : "—"}</div>
          <p className="hint">Sum of indexed receipts on this chain. Not a revenue figure.</p>
        </section>
      </div>
    </>
  );
}
