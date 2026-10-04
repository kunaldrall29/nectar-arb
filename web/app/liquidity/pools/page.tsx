"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Pool = {
  address: string;
  maker: string;
  pricingUpdater: string;
  collateralInventory: string;
  debtBalance: string;
  inventoryCap: string;
  baseSpreadBps: string;
  indicativeBid: string;
  bidLive: boolean;
  publicLpShares: boolean;
};

export default function PoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    apiGet<{ pools: Pool[] }>("/v1/pools")
      .then((body) => setPools(body.pools))
      .catch((err: Error) => setError(err.message));
  }, []);

  const pool = pools[0];
  const reason = !pool
    ? "No pool is deployed on this chain."
    : !pool.bidLive
      ? "The indicative bid is not live. A stale or invalid price produces no bid."
      : !checked
        ? "Check the pool, the bid, and the chain before submitting the keeper job."
        : null;

  async function submit() {
    const response = await fetch("/nectar-api/v1/actions/propamm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const body = (await response.json()) as { error?: { message: string }; receipt?: { txHash: string } };
    setMessage(response.ok ? `Settled ${body.receipt?.txHash}` : body.error?.message ?? "PropAMM action failed.");
  }

  return (
    <>
      <h1>Liquidity pools</h1>
      <p className="lede">The pool is owned by one maker. previewBid is indicative. buyCollateral runs only inside an authenticated job. The pricing updater cannot withdraw.</p>
      {error ? <p className="reason">{error}</p> : null}
      {pool ? (
        <section className="panel">
          <div className="row"><span>Pool</span><span className="mono">{pool.address}</span></div>
          <div className="row"><span>Maker</span><span className="mono">{pool.maker}</span></div>
          <div className="row"><span>Pricing updater</span><span className="mono">{pool.pricingUpdater}</span></div>
          <div className="row"><span>Debt inventory</span><span>{pool.debtBalance}</span></div>
          <div className="row"><span>Collateral inventory</span><span>{pool.collateralInventory}</span></div>
          <div className="row"><span>Cap</span><span>{pool.inventoryCap}</span></div>
          <div className="row"><span>Indicative bid</span><span>{pool.bidLive ? pool.indicativeBid : "no bid"}</span></div>
          <div className="row"><span>Public LP shares</span><span>{pool.publicLpShares ? "yes" : "no"}</span></div>
          <label>
            <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /> I have checked the pool and the bid.
          </label>
          <p>
            <button className="primary" disabled={Boolean(reason)} onClick={submit}>
              Settle with PropAMM
            </button>
          </p>
          {reason ? <p className="reason">{reason}</p> : null}
          {message ? <p>{message}</p> : null}
        </section>
      ) : null}
    </>
  );
}
