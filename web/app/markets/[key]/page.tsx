"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet } from "@/lib/api";

export default function MarketDetail() {
  const params = useParams<{ key: string }>();
  const [market, setMarket] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!params.key) return;
    apiGet<{ market: Record<string, unknown> }>(`/v1/markets/${params.key}`)
      .then((body) => setMarket(body.market))
      .catch((err: Error) => setError(err.message));
  }, [params.key]);
  return (
    <>
      <h1>Market</h1>
      {error ? <p className="reason">{error}</p> : null}
      {market ? (
        <section className="panel">
          {Object.entries(market).map(([key, value]) => (
            <div className="row" key={key}>
              <span>{key}</span>
              <span className="mono">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
