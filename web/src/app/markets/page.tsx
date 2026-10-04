"use client";

import { useState } from "react";
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnitsExact, mockOracleAbi, type MarketView, type PositionView } from "@nectar/core";
import { useNetwork } from "@/lib/network-context";
import { useChainState } from "@/lib/use-chain-state";
import { explorerAddress, explorerTx } from "@/lib/explorer";

const STRESS_FACTOR = 85n; // drop to 85% of reference — labeled testnet stress

export default function MarketsPage() {
  const { net } = useNetwork();
  const { data, refetch } = useChainState();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [busy, setBusy] = useState<string | null>(null);

  const write = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: write.data });

  async function stressPrice(m: MarketView) {
    if (!address) return alert("Connect wallet");
    if (chainId !== net.chain.id) await switchChainAsync({ chainId: net.chain.id });
    setBusy(m.marketKey);
    const target = (BigInt(m.oracle.referenceLoanUnits) * STRESS_FACTOR) / 100n;
    const price = (target * 10n ** 36n) / 10n ** BigInt(m.collateralToken.decimals);
    write.writeContract({
      address: m.oracle.address,
      abi: mockOracleAbi,
      functionName: "setPrice",
      args: [price],
    });
  }

  if (!net.deployment) return <MissingDeploy note={net.note} />;
  if (!data) return <p className="text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Markets</h1>
        <p className="text-sm text-zinc-500">Monitored MiniMorpho-style demo markets with mock oracles (PX05).</p>
      </div>
      {data.markets.map((m) => (
        <div key={m.marketKey} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">{m.label}</h2>
              <p className="text-xs text-zinc-500 font-mono">{m.marketKey.slice(0, 18)}…</p>
            </div>
            <span className={`badge ${m.oracle.status === "valid" ? "bg-nectar-mint/20 text-nectar-mint" : "bg-nectar-rose/20 text-nectar-rose"}`}>
              price {m.oracle.status}
            </span>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>Collateral price ≈ ${formatUnitsExact(m.oracle.priceLoanUnits, m.loanToken.decimals, 2)} / token</div>
            <div>Liquidatable debt {formatUnitsExact(m.liquidatableDebt, m.loanToken.decimals, 0)} {m.loanToken.symbol}</div>
            <div>Unserved {formatUnitsExact(m.unservedDebt, m.loanToken.decimals, 0)} {m.loanToken.symbol}</div>
          </div>
          {m.oracle.openStress && (
            <div className="mt-4 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
              <p className="text-sm font-medium text-nectar-amber">Testnet stress scenario</p>
              <p className="text-xs text-zinc-400">Simulates an oracle price drop within mock bounds. Not a production feed.</p>
              <button type="button" className="btn-primary mt-2" disabled={!!busy || confirming} onClick={() => stressPrice(m)}>
                {busy === m.marketKey && confirming ? "Confirming…" : "Drop price ~15%"}
              </button>
              {write.data && (
                <a className="ml-3 text-xs" href={explorerTx(net, write.data) ?? "#"} target="_blank" rel="noreferrer">
                  tx {write.data.slice(0, 10)}…
                </a>
              )}
            </div>
          )}
          <PositionTable positions={data.positions.filter((p) => p.marketKey === m.marketKey)} loanDecimals={m.loanToken.decimals} symbol={m.loanToken.symbol} net={net} />
        </div>
      ))}
      <button type="button" className="btn-ghost text-xs" onClick={() => refetch()}>
        Refresh state
      </button>
    </div>
  );
}

function PositionTable({ positions, loanDecimals, symbol, net }: { positions: PositionView[]; loanDecimals: number; symbol: string; net: ReturnType<typeof useNetwork>["net"] }) {
  if (!positions.length) return <p className="mt-4 text-sm text-zinc-500">No open positions.</p>;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-zinc-500">
          <tr>
            <th className="py-2">Borrower</th>
            <th>Status</th>
            <th>Debt</th>
            <th>Quote</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.borrower} className="border-t border-nectar-border/60">
              <td className="py-2 font-mono text-xs">
                <a href={explorerAddress(net, p.borrower)} target="_blank" rel="noreferrer">
                  {p.borrower.slice(0, 8)}…
                </a>
              </td>
              <td>
                <span className={`badge ${p.status === "liquidatable" ? "bg-nectar-rose/20 text-nectar-rose" : p.status === "at-risk" ? "bg-amber-900/30 text-amber-200" : "bg-zinc-800"}`}>
                  {p.status}
                </span>
              </td>
              <td>{formatUnitsExact(p.debt, loanDecimals, 2)} {symbol}</td>
              <td>{p.coveredByQuote ? "covered" : "unserved"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MissingDeploy({ note }: { note: string }) {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold">Markets</h1>
      <p className="mt-2 text-zinc-400">{note}</p>
    </div>
  );
}
