"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/wallet";

export default function MarketDetail({ params }: { params: { key: string } }) {
  const [market, setMarket] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api(`/markets/${params.key}`)
      .then(setMarket)
      .catch((e) => setErr(e.message));
  }, [params.key]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl text-nectar-honey">Market</h1>
      <p className="text-sm text-nectar-mist">
        Admission records identity only. It does not move lender or borrower funds, and it does not change the
        underlying loan terms.
      </p>
      {err && <div className="text-nectar-bad">{err}</div>}
      <pre className="panel overflow-auto rounded-2xl p-4 text-xs text-nectar-honey">
        {JSON.stringify(market, null, 2)}
      </pre>
    </div>
  );
}
