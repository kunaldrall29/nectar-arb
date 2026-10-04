"use client";

import { ChainNotice, Money, Unavailable, useLiveData } from "@/components/Bits";
import { formatUnits } from "@/lib/format";

export default function OverviewPage() {
  const { hidden, ws, meta, wallet } = useLiveData();
  const decimals = ws?.market.debtDecimals ?? 6;
  const symbol = ws?.market.debtSymbol ?? "nUSD";
  const liquidity = ws?.liquidity;
  return (
    <>
      <h1>Overview</h1>
      <p className="lede">
        Funded, time-bounded bids that settle debt and collateral in one transaction. This workspace reads one chain at a time.
        A combined figure is not spendable cash.
      </p>
      <ChainNotice />
      {hidden || !ws || !meta ? null : (
        <>
          <div className="grid stats">
            <section className="panel">
              <div className="kicker">Funded maker cash</div>
              <div className="figure">
                {liquidity ? <Money amount={liquidity.cash} decimals={decimals} symbol={symbol} /> : "No wallet"}
              </div>
              <p className="hint">Escrow liability for {wallet ? "the selected maker" : "no selected maker"}. Chain {meta.chainId}.</p>
            </section>
            <section className="panel">
              <div className="kicker">Reserved</div>
              <div className="figure">
                {liquidity ? <Money amount={liquidity.reserved} decimals={decimals} symbol={symbol} /> : "—"}
              </div>
              <p className="hint">Held by unconsumed quotes. Expired cash stays reserved until release is included.</p>
            </section>
            <section className="panel">
              <div className="kicker">Available</div>
              <div className="figure">
                {liquidity ? <Money amount={liquidity.available} decimals={decimals} symbol={symbol} /> : "—"}
              </div>
              <p className="hint">Withdrawable on this chain only. Not combined with any other network.</p>
            </section>
          </div>
          <div className="grid two" style={{ marginTop: 12 }}>
            <section className="panel">
              <h2>Opportunities</h2>
              <div className="row"><span>Liquidatable rehearsal debt</span><span>{formatUnits(ws.market.unservedDebt, decimals)} unserved + {formatUnits(ws.market.executableDebt, decimals)} executable</span></div>
              <div className="row"><span>Active quotes</span><span>{ws.market.quoteCount}</span></div>
              <div className="row"><span>Price</span><span>{ws.market.priceStatus}</span></div>
              <div className="row"><span>Pause</span><span>{ws.paused ? "New risk paused" : "Reservations and execution open"}</span></div>
              {ws.market.quoteCount === 0 && ws.liabilities !== "0" && (
                <p className="hint">Escrow may hold cash while executable capacity is zero. Funded cash is not the same as a live quote.</p>
              )}
              {ws.market.executableDebt === "0" && ws.market.unservedDebt !== "0" && (
                <p className="hint">Zero executable capacity: a position is liquidatable and no active funded quote covers it.</p>
              )}
            </section>
            <section className="panel">
              <h2>Other network</h2>
              <Unavailable
                title="Robinhood Chain testnet"
                body="Deployed, not connected. No cash figure from chain 46630 is shown in this session. An outage there does not lock the connected chain."
              />
              <p className="secondary">
                Rehearsal mark {liquidity ? formatUnits(liquidity.cash, decimals) : "—"} {symbol}, observed {meta.observedAt}. Not a market price and not spendable on another chain.
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
