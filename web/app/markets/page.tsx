"use client";

import Link from "next/link";
import { ChainNotice, Money, useLiveData } from "@/components/Bits";

export default function MarketsPage() {
  const { hidden, ws } = useLiveData();
  const market = ws?.market;
  return (
    <>
      <h1>Markets</h1>
      <p className="lede">Integrated markets and monitored networks stay distinct. A market with no route is a real state.</p>
      <ChainNotice />
      {hidden || !market ? null : (
        <Link className="panel market-link" href={`/markets/${market.marketKey}`}>
          <header>
            <h2 style={{ margin: 0 }}>{market.label}</h2>
            <span className="pill neutral">Integrated rehearsal</span>
          </header>
          <div className="row"><span>Chain</span><span>{market.chainId === 31337 ? "Local Anvil stand-in" : market.chainId}</span></div>
          <div className="row"><span>Protocol</span><span>{market.protocol}</span></div>
          <div className="row"><span>Debt / collateral</span><span>{market.debtSymbol} / {market.collateralSymbol}</span></div>
          <div className="row"><span>Price status</span><span>{market.priceStatus}</span></div>
          <div className="row"><span>Active quotes</span><span>{market.quoteCount}</span></div>
          <div className="row"><span>Route</span><span>Funded quote. No AMM route in this slice.</span></div>
          <div className="row"><span>Unserved debt</span><Money amount={market.unservedDebt} decimals={market.debtDecimals} symbol={market.debtSymbol} /></div>
          <p className="hint">{market.protocolNote}</p>
        </Link>
      )}
    </>
  );
}
