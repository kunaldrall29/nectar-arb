"use client";

import { useEffect, useState } from "react";
import { MakerPanel } from "@/components/MakerPanel";
import { useNetworkFilter } from "@/components/NetworkFilter";
import { filterByFamily, formatUsd6 } from "@/lib/data";

type Account = {
  network: string;
  family: string;
  maker: string;
  deposited: string;
  reserved: string;
  available: string;
};

type Quote = {
  quoteId: string;
  network: string;
  family: string;
  status: string;
  cashOut: string;
  validUntil: number;
};

export default function LiquidityPage() {
  const { family } = useNetworkFilter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    void fetch("/api/quotes").then((r) => r.json()).then((d) => setQuotes(d.quotes ?? []));
    void fetch("/api/cash-accounts")
      .then((r) => r.json())
      .catch(() => ({ accounts: [] }))
      .then((d) => setAccounts(d.accounts ?? []));
  }, []);

  const accts = filterByFamily(accounts, family === "all" ? "all" : family);
  const qs = filterByFamily(quotes, family === "all" ? "all" : family);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Liquidity</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <MakerPanel />
        <div className="rounded-xl border border-nectar-border bg-nectar-panel p-4">
          <h2 className="font-medium">Cash accounts</h2>
          {accts.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No indexed deposits yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {accts.map((a) => (
                <li key={`${a.network}-${a.maker}`} className="rounded border border-nectar-border p-2">
                  <p className="font-mono text-xs text-slate-500">{a.maker}</p>
                  <p>Available {formatUsd6(a.available)} · Reserved {formatUsd6(a.reserved)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <section>
        <h2 className="font-medium">Quotes</h2>
        <p className="text-xs text-slate-500">Publish quote: run backend seed or sign EIP-712 via SDK (demo uses seed).</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-nectar-border">
          <table className="min-w-full text-sm">
            <thead className="bg-nectar-panel text-slate-400">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Cash out</th>
                <th className="px-3 py-2">Valid until</th>
                <th className="px-3 py-2">Network</th>
              </tr>
            </thead>
            <tbody>
              {qs.map((q) => (
                <tr key={q.quoteId} className="border-t border-nectar-border">
                  <td className="px-3 py-2">{q.status}</td>
                  <td className="px-3 py-2">{formatUsd6(q.cashOut)}</td>
                  <td className="px-3 py-2">{new Date(q.validUntil * 1000).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-400">{q.network}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
