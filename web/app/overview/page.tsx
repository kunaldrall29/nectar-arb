"use client";

import { useEffect, useState } from "react";
import { apiGet, type Receipt } from "@/lib/api";

export default function OverviewPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [h, r] = await Promise.all([
          apiGet<Record<string, unknown>>("/health"),
          apiGet<{ receipts: Receipt[] }>("/v1/receipts"),
        ]);
        if (!stop) {
          setHealth(h);
          setReceipts(r.receipts ?? []);
          setError(null);
        }
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "API unavailable");
      }
    }
    load();
    const timer = setInterval(load, 8000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <h1>Overview</h1>
      <p className="lede">This page reads one chain. A figure from another network is not spendable here.</p>
      {error ? <p className="reason">{error}. Start the API with pnpm dev after pnpm local:bootstrap.</p> : null}
      <div className="grid stats">
        <section className="panel">
          <div className="kicker">Connected chain</div>
          <div className="figure">{health ? String(health.chainId ?? "—") : "—"}</div>
          <p className="hint">{health ? String(health.networkName ?? "") : "Waiting for the API"}</p>
        </section>
        <section className="panel">
          <div className="kicker">Indexed settlements</div>
          <div className="figure">{receipts.length}</div>
          <p className="hint">Count of receipts from this deployment. Not revenue.</p>
        </section>
        <section className="panel">
          <div className="kicker">Store</div>
          <div className="figure">{health ? String(health.store ?? "—") : "—"}</div>
          <p className="hint">Docker is not available here, so the local store is SQLite.</p>
        </section>
      </div>
    </>
  );
}
