"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/wallet";

export default function MarketsPage() {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/markets").then(setData).catch((e) => setErr(e.message));
  }, []);

  const markets = (data?.markets || []).filter((m: any) => {
    if (filter === "all") return true;
    if (filter === "stellar") return m.chainId === 1000;
    if (filter === "arbitrum") return m.chainId === 421614;
    if (filter === "robinhood") return m.chainId === 46630;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-nectar-honey">Markets</h1>
        <p className="mt-2 text-nectar-mist">
          Filtering changes what is shown, not where funds are held. A market with no supported route is a valid empty
          state.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["all", "All networks"],
          ["stellar", "Stellar"],
          ["arbitrum", "Arbitrum"],
          ["robinhood", "Robinhood Chain"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === id ? "bg-nectar-gold text-[#2a1608]" : "border border-nectar-line text-nectar-mist"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {err && <div className="rounded-xl border border-nectar-bad/40 p-4 text-nectar-bad">Unavailable: {err}</div>}
      <div className="grid gap-4">
        {markets.map((m: any) => (
          <Link
            key={m.marketKey}
            href={`/markets/${m.marketKey}`}
            className="panel rounded-2xl p-5 transition hover:border-nectar-gold/40"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-2xl">{m.marketId || m.protocol}</div>
                <div className="text-sm text-nectar-mist">
                  {m.chain} · {m.protocol}
                </div>
              </div>
              <span className="rounded-full border border-nectar-line px-3 py-1 text-xs uppercase">
                {m.status}
              </span>
            </div>
            <div className="mt-3 text-sm text-nectar-mist">
              Routes: {m.routes?.length ? m.routes.join(", ") : "none — monitored only"}
            </div>
            {m.note && <div className="mt-2 text-sm text-nectar-wait">{m.note}</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
