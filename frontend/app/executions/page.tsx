"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LIVE, explorerTx } from "@/lib/config";
import { usd } from "@/lib/format";
import { api, loadWallet } from "@/lib/wallet";

export default function ExecutionsPage() {
  const [data, setData] = useState<any>(null);
  const [quoteId, setQuoteId] = useState("");
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/receipts").then(setData).catch((e) => setErr(e.message));
  }, []);

  async function preview() {
    setOut(await api("/jobs/preview", { method: "POST", body: JSON.stringify({ quoteId }) }));
  }
  async function execute() {
    const w = loadWallet();
    if (!w) throw new Error("Connect a wallet first");
    setOut(
      await api("/jobs", {
        method: "POST",
        body: JSON.stringify({ secret: w.secret, quoteId }),
      }),
    );
  }
  async function rehearse() {
    setErr(null);
    try {
      setOut(await api("/demo/rehearse", { method: "POST", body: JSON.stringify({}) }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "rehearse failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-nectar-honey">Executions</h1>
        <p className="mt-2 text-nectar-mist">
          A wallet rejection is not a failed on-chain liquidation. Broadcast is not filled. This page shows included
          and finalized receipts from Stellar testnet.
        </p>
      </div>

      <div className="panel rounded-2xl p-5">
        <div className="font-display text-xl">Keeper desk</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={quoteId}
            onChange={(e) => setQuoteId(e.target.value)}
            placeholder="quote id hex"
            className="min-w-[240px] flex-1 rounded-full border border-nectar-line bg-transparent px-4 py-2 text-sm"
          />
          <button onClick={preview} className="rounded-full border border-nectar-line px-4 py-2 text-sm">
            Preview
          </button>
          <button onClick={execute} className="rounded-full bg-nectar-gold px-4 py-2 text-sm text-[#2a1608]">
            Execute job
          </button>
          <button onClick={rehearse} className="rounded-full border border-nectar-gold/50 px-4 py-2 text-sm">
            Run on-chain rehearsal
          </button>
        </div>
        {err && <div className="mt-3 text-sm text-nectar-bad">{err}</div>}
      </div>

      {(data?.receipts || []).map((r: any) => (
        <Link
          key={r.quoteId}
          href={`/executions/${r.quoteId}`}
          className="panel block rounded-2xl p-5"
        >
          <div className="flex justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-nectar-mist">Finalized receipt</div>
              <div className="font-display text-2xl">Recovered {usd(r.debt_repay || r.debtRepay || r.receipt?.debtRepay)}</div>
              <div className="text-sm text-nectar-mist">Self-operated maker / keeper · labeled demo evidence</div>
            </div>
            <span className="text-nectar-ok text-sm">included</span>
          </div>
        </Link>
      ))}

      <a className="inline-block text-sm text-nectar-gold" href={explorerTx(LIVE.transactions.execute)}>
        First live fixture on Stellar Expert →
      </a>
      {out && <pre className="panel overflow-auto rounded-2xl p-4 text-xs">{JSON.stringify(out, null, 2)}</pre>}
    </div>
  );
}
