"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Market = {
  marketKey: string;
  chainId: number;
  label: string;
  protocol: string;
  integrated?: boolean;
  active?: boolean;
  debtToken?: string;
  collateralToken?: string;
  routes?: string[];
  note?: string;
};

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: Market[] }>("/v1/markets")
      .then((r) => setMarkets(r.data))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8">
      <h1 className="display text-4xl text-[var(--honey)]">Markets</h1>
      <p className="mt-2 max-w-2xl text-[var(--fog)]">
        Integrated markets can settle funded quotes. Monitored markets stay read-only until admission.
      </p>
      {error && <p className="mt-6 text-[var(--danger)]">{error}</p>}
      <div className="mt-8 space-y-4">
        {markets.map((m) => (
          <article key={m.marketKey} className="panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="display text-2xl text-[var(--mist)]">{m.label}</h2>
                <p className="mt-1 text-sm text-[var(--fog)]">
                  Chain {m.chainId} · {m.protocol}
                </p>
              </div>
              <span className="env-pill">{m.integrated ? "Integrated" : "Monitored"}</span>
            </div>
            {m.note && <p className="mt-3 text-sm text-[var(--fog)]">{m.note}</p>}
            {m.routes && m.routes.length > 0 && (
              <p className="mt-3 text-sm text-[var(--nectar-bright)]">Routes: {m.routes.join(" · ")}</p>
            )}
            {m.debtToken && (
              <p className="mt-2 break-all font-mono text-xs text-[var(--fog)]">
                debt {m.debtToken}
                <br />
                coll {m.collateralToken}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
