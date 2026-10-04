"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";

export function DemoRunner() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiPost<{
        data: { executeTx: string; quoteId: string; positionId: string; status: string; explorer?: string };
      }>("/v1/demo/run-liquidation");
      setResult(
        `Settled (${res.data.status}). Quote ${res.data.quoteId.slice(0, 10)}… · Tx ${res.data.executeTx.slice(0, 12)}…`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--nectar-bright)]">Live testnet path</p>
      <h3 className="display mt-2 text-2xl text-[var(--mist)]">Run funded liquidation</h3>
      <p className="mt-2 text-sm text-[var(--fog)]">
        Deposit → reserve EIP-712 quote → execute Morpho-style settlement (Section 9 fixture).
      </p>
      <button className="btn-primary mt-5 w-full" disabled={busy} onClick={run}>
        {busy ? "Settling…" : "Execute demo flow"}
      </button>
      {result && <p className="mt-4 text-sm text-[var(--ok)]">{result}</p>}
      {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
