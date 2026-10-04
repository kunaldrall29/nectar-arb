"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChainNotice, Money, useLiveData } from "@/components/Bits";
import { getJson } from "@/lib/api";
import { shortAddr } from "@/lib/format";

type OfficialDebt = {
  chainId: number;
  network: string;
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  issuer: string;
};

type RobinhoodContracts = {
  chainId: number;
  escrow: string;
  quotes: string;
  executor: string;
  rehearsalMarket: string;
  debtToken: string;
  debtSymbol: string;
  collateralToken: string;
  collateralSymbol: string;
  officialDebt: { address: string; symbol: string; decimals: number; name: string } | null;
  figures: null;
  figuresReason: string;
};

type NetworksBody = {
  officialDebt: OfficialDebt[];
  rehearsalDebt: { symbol: string; note: string };
  networks: Array<{ id: string; contracts?: RobinhoodContracts }>;
};

type GmxBody = {
  chain: string;
  source: string;
  fetchedAt: string;
  error: string | null;
  tickers: Array<{
    tokenAddress: string;
    tokenSymbol: string;
    minPrice: string;
    maxPrice: string;
    updatedAt: number | string;
    timestamp: number | string;
  }>;
};

export default function MarketsPage() {
  const { hidden, ws, filter } = useLiveData();
  const market = ws?.market;
  const [networks, setNetworks] = useState<NetworksBody | null>(null);
  const [gmx, setGmx] = useState<GmxBody | null>(null);
  useEffect(() => {
    getJson<NetworksBody>("/nectar-api/v1/networks").then(setNetworks).catch(() => setNetworks(null));
    getJson<GmxBody>("/nectar-api/v1/reference/gmx").then(setGmx).catch(() => setGmx(null));
  }, []);
  const robinhood = networks?.networks.find((item) => item.id === "robinhood-testnet")?.contracts;
  const showRehearsal = !hidden && Boolean(market);
  const preferred = ["ETH", "BTC", "ARB", "LINK", "USDC"];
  const tickers = (gmx?.tickers ?? [])
    .filter((ticker) => preferred.includes(ticker.tokenSymbol))
    .slice(0, 6);

  return (
    <>
      <h1>Markets</h1>
      <p className="lede">Integrated markets and monitored networks stay distinct. A market with no route is a real state.</p>
      <ChainNotice />
      {showRehearsal && market ? (
        <Link className="panel market-link" href={`/markets/${market.marketKey}`}>
          <header>
            <h2 style={{ margin: 0 }}>{market.label}</h2>
            <span className="pill neutral">Integrated rehearsal</span>
          </header>
          <div className="row"><span>Chain</span><span>{market.chainId === 31337 ? "Local Anvil stand-in" : market.chainId}</span></div>
          <div className="row"><span>Protocol</span><span>{market.protocol}</span></div>
          <div className="row"><span>Rehearsal debt / collateral</span><span>{market.debtSymbol} / {market.collateralSymbol}</span></div>
          <div className="row"><span>Price status</span><span>{market.priceStatus}</span></div>
          <div className="row"><span>Active quotes</span><span>{market.quoteCount}</span></div>
          <div className="row"><span>Route</span><span>Funded quote. No AMM route in this slice.</span></div>
          <div className="row"><span>Unserved debt</span><Money amount={market.unservedDebt} decimals={market.debtDecimals} symbol={market.debtSymbol} /></div>
          <p className="hint">{market.protocolNote} {networks?.rehearsalDebt.note}</p>
        </Link>
      ) : null}

      {filter !== "arbitrum-sepolia" && robinhood ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <h2>Robinhood Chain testnet · deployed addresses</h2>
          <p className="hint">{robinhood.figuresReason}</p>
          <div className="row"><span>Chain</span><span>{robinhood.chainId}</span></div>
          <div className="row"><span>Escrow</span><span>{shortAddr(robinhood.escrow)}</span></div>
          <div className="row"><span>Quotes</span><span>{shortAddr(robinhood.quotes)}</span></div>
          <div className="row"><span>Executor</span><span>{shortAddr(robinhood.executor)}</span></div>
          <div className="row"><span>Rehearsal market</span><span>{shortAddr(robinhood.rehearsalMarket)}</span></div>
          <div className="row"><span>Rehearsal debt {robinhood.debtSymbol}</span><span>{shortAddr(robinhood.debtToken)}</span></div>
          <div className="row"><span>Rehearsal collateral {robinhood.collateralSymbol}</span><span>{shortAddr(robinhood.collateralToken)}</span></div>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Official debt asset · Paxos USDG</h2>
        <p className="hint">Read from the token contracts. USDG is not the rehearsal token nUSD.</p>
        {(networks?.officialDebt ?? []).map((asset) => (
          <div className="row" key={asset.chainId}>
            <span>{asset.network}<br />{asset.name} · {asset.issuer}</span>
            <span>{asset.symbol} · {asset.decimals} decimals<br />{shortAddr(asset.address)}</span>
          </div>
        ))}
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>GMX · Arbitrum One reference</h2>
        <p className="hint">
          Live ticker fields from {gmx?.source ?? "the GMX prices API"}. This is not the testnet fill and not a Nectar oracle.
          Fetched {gmx?.fetchedAt ?? "—"}.
        </p>
        {gmx?.error ? <p className="alert">{gmx.error}</p> : null}
        {tickers.length === 0 && !gmx?.error ? <p className="hint">Ticker list is still loading.</p> : null}
        {tickers.length > 0 ? (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Token address</th>
                  <th className="num">Min price</th>
                  <th className="num">Max price</th>
                  <th className="num">Updated at</th>
                  <th className="num">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((ticker) => (
                  <tr key={ticker.tokenAddress}>
                    <td>{ticker.tokenSymbol}</td>
                    <td className="num">{shortAddr(ticker.tokenAddress)}</td>
                    <td className="num">{ticker.minPrice}</td>
                    <td className="num">{ticker.maxPrice}</td>
                    <td className="num">{String(ticker.updatedAt)}</td>
                    <td className="num">{String(ticker.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
