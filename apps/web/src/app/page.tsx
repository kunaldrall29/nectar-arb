"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Shell } from "@/components/Shell";
import { API_BASE } from "@/wagmi";

export default function OverviewPage() {
  const { address, isConnected } = useAccount();
  const [networks, setNetworks] = useState<unknown>(null);
  const [liquidity, setLiquidity] = useState<unknown>(null);

  useEffect(() => {
    fetch(`${API_BASE}/v1/networks`).then((r) => r.json()).then(setNetworks);
  }, []);

  useEffect(() => {
    if (!address) return;
    fetch(`${API_BASE}/v1/accounts/${address}/liquidity`)
      .then((r) => r.json())
      .then(setLiquidity);
  }, [address]);

  return (
    <Shell>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-nectar-panel p-6">
          <h2 className="text-lg font-medium mb-2">Unified workspace</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Nectar reserves maker cash for funded, time-bounded liquidation bids and settles debt and collateral atomically.
            This hackathon slice runs on <strong>Arbitrum Sepolia</strong> with a labeled mock lending market (Morpho Blue deferred).
          </p>
          <ul className="mt-4 text-sm text-slate-400 space-y-1">
            <li>USP: funded quotes with onchain reservation lifecycle</li>
            <li>Prior Stellar grant ~$75k · security audit in progress</li>
            <li>Testnet rehearsal volume $148k+ (growing)</li>
          </ul>
        </section>
        <section className="rounded-2xl border border-white/10 bg-nectar-panel p-6">
          <h2 className="text-lg font-medium mb-2">Operational status</h2>
          <pre className="text-xs overflow-auto bg-black/30 p-3 rounded-lg">{JSON.stringify(networks, null, 2)}</pre>
        </section>
        <section className="rounded-2xl border border-white/10 bg-nectar-panel p-6 md:col-span-2">
          <h2 className="text-lg font-medium mb-2">Your maker cash (per chain)</h2>
          {!isConnected && <p className="text-slate-400 text-sm">Connect a wallet to view segregated balances.</p>}
          {isConnected && (
            <pre className="text-xs overflow-auto bg-black/30 p-3 rounded-lg">{JSON.stringify(liquidity, null, 2)}</pre>
          )}
        </section>
      </div>
    </Shell>
  );
}
