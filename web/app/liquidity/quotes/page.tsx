"use client";

import { useEffect, useState } from "react";
import { apiGet, type Preview } from "@/lib/api";

type Quote = {
  reservationId: string;
  maker: string;
  borrower: string;
  cashOut: string;
  collateralAmount: string;
  status: string;
  validUntil: string;
};

const statusLabel: Record<string, string> = { "0": "unknown", "1": "active", "2": "filled", "3": "released" };

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [q, p] = await Promise.all([
      apiGet<{ quotes: Quote[] }>("/v1/quotes"),
      apiGet<Preview>("/v1/preview/quote"),
    ]);
    setQuotes(q.quotes);
    setPreview(p);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const reason =
    preview?.disabledReason ??
    (!checked ? "Check network, asset, amount, destination, expiry, and fee before submitting." : null);

  async function submit() {
    setMessage(null);
    const response = await fetch("/nectar-api/v1/actions/funded-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const body = (await response.json()) as { error?: { message: string }; receipt?: { txHash: string } };
    if (!response.ok) {
      setMessage(body.error?.message ?? "The quote action failed.");
      return;
    }
    setMessage(`Settled ${body.receipt?.txHash}`);
    await load();
  }

  return (
    <>
      <h1>Liquidity quotes</h1>
      <p className="lede">A firm quote reserves the full cash out. It cannot be cancelled before expiry. Default lifetime is 30 seconds. Maximum is 120.</p>
      {error ? <p className="reason">{error}</p> : null}
      <div className="grid two">
        <section className="panel">
          <h2>Open quotes</h2>
          <table>
            <thead>
              <tr>
                <th>Id</th>
                <th>Cash out</th>
                <th>Collateral</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.reservationId}>
                  <td>{quote.reservationId}</td>
                  <td>{quote.cashOut}</td>
                  <td>{quote.collateralAmount}</td>
                  <td>{statusLabel[quote.status] ?? quote.status}</td>
                </tr>
              ))}
              {quotes.length === 0 ? (
                <tr>
                  <td colSpan={4}>No quotes are registered on this chain.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>Before signing</h2>
          {preview ? (
            <>
              <div className="row"><span>Network</span><span>{preview.network.name} · {preview.network.chainId}</span></div>
              <div className="row"><span>Asset</span><span>{preview.asset}</span></div>
              <div className="row"><span>Amount</span><span>{preview.amount} base units</span></div>
              <div className="row"><span>Destination</span><span className="mono">{preview.destination}</span></div>
              <div className="row"><span>Expiry</span><span>{preview.expiry}</span></div>
              <div className="row"><span>Fee</span><span>{preview.fee}</span></div>
              <p className="hint">{preview.destinationLabel}</p>
              <label>
                <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /> I have checked these fields.
              </label>
              <p>
                <button className="primary" disabled={Boolean(reason)} onClick={submit}>
                  Register and settle funded quote
                </button>
              </p>
              {reason ? <p className="reason">{reason}</p> : null}
              {message ? <p>{message}</p> : null}
            </>
          ) : (
            <p className="hint">Loading the quote preview.</p>
          )}
        </section>
      </div>
    </>
  );
}
