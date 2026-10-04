"use client";

import { formatUnitsExact, nectarExecutorAbi } from "@nectar/core";
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useNetwork } from "@/lib/network-context";
import { useChainState } from "@/lib/use-chain-state";
import { explorerTx } from "@/lib/explorer";

export default function ExecutionsPage() {
  const { net } = useNetwork();
  const d = net.deployment;
  const { data } = useChainState();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const write = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: write.data });

  async function executeLiquidation(quoteId: `0x${string}`, borrower: `0x${string}`) {
    if (!d) return;
    if (!address) return alert("Connect wallet");
    if (chainId !== net.chain.id) await switchChainAsync({ chainId: net.chain.id });
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
    write.writeContract({
      address: d.executor,
      abi: nectarExecutorAbi,
      functionName: "executeJob",
      args: [{ quoteId, borrower, deadline }],
    });
  }

  if (!d) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Executions</h1>
        <p className="mt-2 text-zinc-400">{net.note}</p>
      </div>
    );
  }

  if (!data) return <p className="text-zinc-500">Loading receipts…</p>;

  const opportunities = data.positions.filter((p) => p.status === "liquidatable" && p.coveredByQuote);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Executions</h1>
        <p className="text-sm text-zinc-500">Settled receipts and keeper-style manual execution for demos.</p>
      </div>
      {opportunities.length > 0 && (
        <div className="card p-5">
          <h2 className="font-medium">Ready to execute</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {opportunities.map((p) => {
              const q = data.quotes.find((x) => x.state === "Active" && x.marketKey === p.marketKey);
              return (
                <li key={p.borrower} className="flex flex-wrap items-center justify-between gap-2 border-b border-nectar-border/40 py-2">
                  <span>
                    {p.label} · {p.borrower.slice(0, 10)}…
                  </span>
                  {q && (
                    <button type="button" className="btn-primary" disabled={confirming} onClick={() => executeLiquidation(q.quoteId, p.borrower)}>
                      Execute with quote
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="card overflow-x-auto p-5">
        <h2 className="font-medium">Receipts</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-2">Tx</th>
              <th>Debt repaid</th>
              <th>Collateral</th>
              <th>Keeper fee</th>
              <th>Protocol fee</th>
            </tr>
          </thead>
          <tbody data-testid="receipts-table">
            {data.receipts.map((r) => {
              const m = data.markets.find((x) => x.marketKey === r.marketKey);
              const loanDec = m?.loanToken.decimals ?? 6;
              const colDec = m?.collateralToken.decimals ?? 18;
              return (
                <tr key={r.transactionHash} className="border-t border-nectar-border/50" data-testid="receipt-row">
                  <td className="py-2 font-mono text-xs">
                    <a href={explorerTx(net, r.transactionHash) ?? "#"} target="_blank" rel="noreferrer">
                      {r.transactionHash.slice(0, 10)}…
                    </a>
                  </td>
                  <td>{formatUnitsExact(r.debtRepaid, loanDec, 2)}</td>
                  <td>{formatUnitsExact(r.collateralDelivered, colDec, 4)}</td>
                  <td>{formatUnitsExact(r.keeperFee, loanDec, 2)}</td>
                  <td>{formatUnitsExact(r.protocolFee, loanDec, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.receipts.length && <p className="mt-4 text-zinc-500">No settlements yet — post a quote, stress a price, run the keeper.</p>}
      </div>
    </div>
  );
}
