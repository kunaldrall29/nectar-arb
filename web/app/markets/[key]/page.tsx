"use client";

import { useParams } from "next/navigation";
import { ChainNotice, Money, Unavailable, useLiveData } from "@/components/Bits";
import { shortAddr } from "@/lib/format";

export default function MarketDetailPage() {
  const params = useParams<{ key: string }>();
  const { hidden, ws } = useLiveData();
  const market = ws?.market;
  const match = market && params.key?.toLowerCase() === market.marketKey.toLowerCase();
  return (
    <>
      <h1>Market</h1>
      <ChainNotice />
      {hidden ? null : !match || !market || !ws ? (
        <Unavailable title="No integrated market for that key" body="This prototype admits one rehearsal market. A missing key is not a failed load of a production Morpho market." />
      ) : (
        <>
          <section className="panel">
            <h2>{market.label}</h2>
            <div className="row"><span>Chain id</span><span>{market.chainId}</span></div>
            <div className="row"><span>Protocol</span><span>{market.protocol}</span></div>
            <div className="row"><span>Debt token</span><span>{market.debtSymbol} · {shortAddr(market.debtToken)}</span></div>
            <div className="row"><span>Collateral token</span><span>{market.collateralSymbol} · {shortAddr(market.collateralToken)}</span></div>
            <div className="row"><span>LLTV / bonus</span><span>{market.lltvBps} bps / {market.bonusBps} bps</span></div>
            <div className="row"><span>Price status</span><span>{market.priceStatus}</span></div>
            <p className="hint">{market.protocolNote} No AMM route is configured. That is an empty route list, not an error.</p>
          </section>
          <section className="panel" style={{ marginTop: 12 }}>
            <h2>Positions</h2>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Borrower</th>
                    <th className="num">Debt</th>
                    <th className="num">Collateral</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {market.positions.map((position) => (
                    <tr key={position.borrower}>
                      <td className="num">{shortAddr(position.borrower)}</td>
                      <td className="num"><Money amount={position.debt} decimals={market.debtDecimals} symbol={market.debtSymbol} /></td>
                      <td className="num"><Money amount={position.collateral} decimals={market.collateralDecimals} symbol={market.collateralSymbol} /></td>
                      <td>{position.debt === "0" ? "Closed" : position.liquidatable ? "Liquidatable" : market.priceStatus !== "fresh" ? `Price ${market.priceStatus}` : "Healthy"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel" style={{ marginTop: 12 }}>
            <h2>Quotes on this market</h2>
            {ws.quotes.length === 0 ? (
              <div className="empty"><strong>No quotes yet</strong>A maker can publish one funded single-fill quote from Liquidity. Unsigned interest is not capacity.</div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr><th>Id</th><th>Status</th><th className="num">Cash out</th><th>Borrower</th></tr>
                  </thead>
                  <tbody>
                    {ws.quotes.map((quote) => (
                      <tr key={quote.reservationId}>
                        <td className="num">{quote.reservationId}</td>
                        <td>{quote.status}</td>
                        <td className="num"><Money amount={quote.cashOut} decimals={market.debtDecimals} symbol={market.debtSymbol} /></td>
                        <td className="num">{shortAddr(quote.borrower)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
