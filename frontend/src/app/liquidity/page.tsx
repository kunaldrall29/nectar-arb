"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type Liquidity = {
  wallet: string;
  display: {
    walletBalance: string;
    cashBalance: string;
    reservedCash: string;
    availableCash: string;
  };
};

export default function LiquidityPage() {
  const [wallet, setWallet] = useState<string>("");
  const [liq, setLiq] = useState<Liquidity | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ data: { deployerPublicAddress?: string; fundWallet?: string } }>("/v1/deployment")
      .then((r) => {
        const w = r.data.deployerPublicAddress || r.data.fundWallet || "";
        setWallet(w);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!wallet) return;
    apiGet<{ data: Liquidity }>(`/v1/accounts/${wallet}/liquidity`)
      .then((r) => setLiq(r.data))
      .catch((e) => setMsg(e.message));
  }, [wallet]);

  async function faucet() {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/v1/demo/faucet", { to: wallet });
      const r = await apiGet<{ data: Liquidity }>(`/v1/accounts/${wallet}/liquidity`);
      setLiq(r.data);
      setMsg("Faucet minted nUSD + tAAPL to the demo wallet.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8">
      <h1 className="display text-4xl text-[var(--honey)]">Liquidity</h1>
      <p className="mt-2 max-w-2xl text-[var(--fog)]">
        Maker cash is segregated per chain and token. Reserved quotes are not withdrawable until fill
        or expiry release.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["Wallet nUSD", liq?.display.walletBalance ?? "—"],
          ["Escrow cash", liq?.display.cashBalance ?? "—"],
          ["Available", liq?.display.availableCash ?? "—"]
        ].map(([label, value]) => (
          <div key={label} className="panel">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--fog)]">{label}</p>
            <p className="display mt-2 text-3xl text-[var(--mist)]">{value}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-6">
        <p className="text-sm text-[var(--fog)]">Reserved</p>
        <p className="display text-2xl text-[var(--nectar-bright)]">
          {liq?.display.reservedCash ?? "—"} nUSD
        </p>
        <p className="mt-4 break-all font-mono text-xs text-[var(--fog)]">{wallet || "loading wallet…"}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn-primary" disabled={busy || !wallet} onClick={faucet}>
            {busy ? "Minting…" : "Faucet test tokens"}
          </button>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await apiPost<{ data: { executeTx: string } }>("/v1/demo/run-liquidation");
                setMsg(`Liquidation settled: ${r.data.executeTx}`);
                const li = await apiGet<{ data: Liquidity }>(`/v1/accounts/${wallet}/liquidity`);
                setLiq(li.data);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Publish quote & settle
          </button>
        </div>
        {msg && <p className="mt-4 text-sm text-[var(--mist)]">{msg}</p>}
      </div>
    </div>
  );
}
