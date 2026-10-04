"use client";

import { useState } from "react";
import { formatUnitsExact, mockOracleAbi, type MarketView, type PositionView } from "@nectar/core";
import { useNetwork } from "@/lib/network-context";
import { useChainState } from "@/lib/use-chain-state";
import { explorerAddress } from "@/lib/explorer";
import { useWalletActions } from "@/lib/use-wallet-actions";

const STRESS_FACTOR = 85n;

export default function MarketsPage() {
  const { net } = useNetwork();
  const { data, refetch } = useChainState();
  const { writeContract, waitForTx, confirming } = useWalletActions();
  const [busy, setBusy] = useState<string | null>(null);

  async function stressPrice(m: MarketView) {
    setBusy(m.marketKey);
    try {
      const target = (BigInt(m.oracle.referenceLoanUnits) * STRESS_FACTOR) / 100n;
      const price = (target * 10n ** 36n) / 10n ** BigInt(m.collateralToken.decimals);
      const h = await writeContract({
        address: m.oracle.address,
        abi: mockOracleAbi,
        functionName: "setPrice",
        args: [price],
      });
      await waitForTx(h);
      await refetch();
    } finally {
      setBusy(null);
    }
  }

  if (!net.deployment) return <MissingDeploy note={net.note} />;
  if (!data) return <p className="text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Markets</h1>
        <p className="text-sm text-zinc-500">Monitored demo markets and at-risk positions.</p>
      </div>
      {data.markets.map((m, idx) => (
        <div key={m.marketKey} className="card p-5" data-testid={`market-card-${idx}`}>
          <h2 className="text-lg font-medium">{m.label}</h2>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>Price ≈ ${formatUnitsExact(m.oracle.priceLoanUnits, m.loanToken.decimals, 2)}</div>
            <div data-testid={`liquidatable-${idx}`}>
              Liquidatable {formatUnitsExact(m.liquidatableDebt, m.loanToken.decimals, 0)} {m.loanToken.symbol}
            </div>
            <div>Unserved {formatUnitsExact(m.unservedDebt, m.loanToken.decimals, 0)}</div>
          </div>
          {m.oracle.openStress && (
            <div className="mt-4 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
              <p className="text-sm font-medium text-nectar-amber">Testnet stress scenario</p>
              <button
                type="button"
                data-testid={idx === 0 ? "stress-price-btn" : `stress-price-${idx}`}
                className="btn-primary mt-2"
                disabled={!!busy || confirming}
                onClick={() => stressPrice(m)}
              >
                {busy === m.marketKey ? "Confirming…" : "Drop price ~15%"}
              </button>
            </div>
          )}
          <PositionTable
            positions={data.positions.filter((p) => p.marketKey === m.marketKey)}
            loanDecimals={m.loanToken.decimals}
            symbol={m.loanToken.symbol}
            net={net}
          />
        </div>
      ))}
    </div>
  );
}

function PositionTable({
  positions,
  loanDecimals,
  symbol,
  net,
}: {
  positions: PositionView[];
  loanDecimals: number;
  symbol: string;
  net: ReturnType<typeof useNetwork>["net"];
}) {
  return (
    <div className="mt-4 overflow-x-auto" data-testid="positions-table">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-zinc-500">
          <tr>
            <th className="py-2">Borrower</th>
            <th>Status</th>
            <th>Debt</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.borrower} className="border-t border-nectar-border/60" data-testid={`position-${p.status}`}>
              <td className="py-2 font-mono text-xs">
                <a href={explorerAddress(net, p.borrower)} target="_blank" rel="noreferrer">
                  {p.borrower.slice(0, 8)}…
                </a>
              </td>
              <td>{p.status}</td>
              <td>
                {formatUnitsExact(p.debt, loanDecimals, 2)} {symbol}
              </td>
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
