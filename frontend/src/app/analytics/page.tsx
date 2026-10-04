"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Analytics = {
  testnetVolumeUsd: number;
  recoveredDebtUsd: number;
  quoteFillRate: number;
  activeMakers: number;
  stellarHeritageGrantUsd: number;
  securityAudit: string;
  usp: string;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    apiGet<{ data: Analytics }>("/v1/analytics/overview")
      .then((r) => setData(r.data))
      .catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8">
      <h1 className="display text-4xl text-[var(--honey)]">Analytics</h1>
      <p className="mt-2 max-w-2xl text-[var(--fog)]">
        Measured testnet outcomes only. Simulations and self-operated makers are labeled in demo
        evidence.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="panel md:col-span-2">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--nectar-bright)]">USP</p>
          <p className="display mt-2 text-2xl text-[var(--mist)] md:text-3xl">{data?.usp}</p>
        </div>
        <div className="panel">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--fog)]">Testnet volume</p>
          <p className="display mt-2 text-4xl text-[var(--nectar-bright)]">
            ${data ? Math.round(data.testnetVolumeUsd).toLocaleString() : "—"}+
          </p>
        </div>
        <div className="panel">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--fog)]">Recovered debt</p>
          <p className="display mt-2 text-4xl text-[var(--mist)]">
            ${data ? Math.round(data.recoveredDebtUsd).toLocaleString() : "—"}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--fog)]">Quote fill rate</p>
          <p className="display mt-2 text-4xl text-[var(--mist)]">
            {data ? `${Math.round(data.quoteFillRate * 100)}%` : "—"}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--fog)]">Security</p>
          <p className="display mt-2 text-3xl text-[var(--mist)]">Under audit</p>
          <p className="mt-2 text-sm text-[var(--fog)]">Status: {data?.securityAudit ?? "—"}</p>
        </div>
        <div className="panel md:col-span-2">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--fog)]">Heritage</p>
          <p className="mt-2 text-[var(--mist)]">
            Built on lessons from the original Stellar/Soroban pooled-liquidation protocol, with a prior
            Stellar grant of ${data?.stellarHeritageGrantUsd?.toLocaleString() ?? "75,000"}.
          </p>
        </div>
      </div>
    </div>
  );
}
