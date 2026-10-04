"use client";

import { useEffect, useState } from "react";
import { useNetworkFilter } from "@/components/NetworkFilter";
import { filterByFamily, formatUsd6 } from "@/lib/data";

type Market = {
  network: string;
  family: string;
  symbol: string;
  marketKey: string;
  activeQuotes: number;
  reservedCash: string;
  admitted: boolean;
};

export default function MarketsPage() {
  const { family } = useNetworkFilter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    void fetch("/api/markets")
      .then((r) => r.json())
      .then((d) => {
        setMarkets(d.markets ?? []);
        setStale(!!d.stale);
      });
  }, []);

  const rows = filterByFamily(markets, family === "all" ? "all" : family);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Markets</h1>
      {stale ? (
        <p className="text-sm text-amber-300/80">Showing bundled snapshot — connect a backend via NEXT_PUBLIC_NECTAR_API_URL for live indexing.</p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No admitted markets in this filter. Deploy contracts and run the seed script.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-nectar-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-nectar-panel text-slate-400">
              <tr>
                <th className="px-4 py-3">Market</th>
                <th className="px-4 py-3">Network</th>
                <th className="px-4 py-3">Active quotes</th>
                <th className="px-4 py-3">Reserved cash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={`${m.network}-${m.marketKey}`} className="border-t border-nectar-border">
                  <td className="px-4 py-3 font-medium">{m.symbol}</td>
                  <td className="px-4 py-3 text-slate-400">{m.network}</td>
                  <td className="px-4 py-3">{m.activeQuotes}</td>
                  <td className="px-4 py-3">{formatUsd6(m.reservedCash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
