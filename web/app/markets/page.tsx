"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Market = {
  marketId: string;
  debtSymbol: string;
  collateralSymbol: string;
  sandboxLabel: string;
  paused: boolean;
  lltv: string;
  quoteBorrower: { unhealthy: boolean; repaid: string; seized: string };
};

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<{ markets: Market[] }>("/v1/markets")
      .then((body) => setMarkets(body.markets))
      .catch((err: Error) => setError(err.message));
  }, []);
  return (
    <>
      <h1>Markets</h1>
      <p className="lede">Each market id binds the chain, tokens, adapter, oracle, and policy. The lending venue in this lab is Nectar Sandbox Morpho.</p>
      {error ? <p className="reason">{error}</p> : null}
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th>Pair</th>
              <th>Venue</th>
              <th>Quote borrower debt</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => (
              <tr key={market.marketId}>
                <td>
                  <Link href={`/markets/${market.marketId}`}>{market.marketId.slice(0, 10)}…</Link>
                </td>
                <td>
                  {market.collateralSymbol} / {market.debtSymbol}
                </td>
                <td>{market.sandboxLabel}</td>
                <td>{market.quoteBorrower.unhealthy ? market.quoteBorrower.repaid : "not liquidatable"}</td>
              </tr>
            ))}
            {markets.length === 0 && !error ? (
              <tr>
                <td colSpan={4}>No market is readable yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
