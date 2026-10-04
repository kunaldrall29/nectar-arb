"use client";

import { useWallet } from "@/lib/wallet";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";

export default function OverviewPage() {
  const { address, isConnected } = useWallet();
  const [liquidity, setLiquidity] = useState<Record<string, string> | null>(null);
  const [networks, setNetworks] = useState<unknown[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/v1/networks`).then((r) => r.json()).then((j) => setNetworks(j.data ?? []));
  }, []);

  useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/v1/accounts/${address}/liquidity`)
      .then((r) => r.json())
      .then((j) => setLiquidity(j.data ?? null))
      .catch(() => setLiquidity(null));
  }, [address]);

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <section>
        <h1>Unified liquidation liquidity</h1>
        <p className="muted">
          One workspace for funded maker quotes and atomic settlement. Chain-local cash — never cross-chain spendable.
        </p>
      </section>
      <div className="grid grid-3">
        <div className="card">
          <h2>Cash (this chain)</h2>
          <p style={{ fontSize: "1.4rem", margin: 0 }}>
            {liquidity ? `${(Number(liquidity.available) / 1e6).toFixed(2)} tUSDC` : isConnected ? "…" : "Connect wallet"}
          </p>
          <p className="muted">Available maker cash after reservations</p>
        </div>
        <div className="card">
          <h2>Reserved</h2>
          <p style={{ fontSize: "1.4rem", margin: 0 }}>
            {liquidity ? `${(Number(liquidity.reserved) / 1e6).toFixed(2)} tUSDC` : "—"}
          </p>
        </div>
        <div className="card">
          <h2>Networks</h2>
          <p style={{ margin: 0 }}>{networks.length} configured</p>
          <p className="muted">Filter in Markets; funds stay per chain</p>
        </div>
      </div>
      <div className="card">
        <h2>Pilot metrics (disclosed)</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
          <li>Testnet settlement volume tracked for demo: $148k+ narrative target</li>
          <li>Prior Stellar pooled-liquidation grant ~$75k informs design; EVM adapters are new code</li>
          <li>Independent security review in progress for pilot scope</li>
        </ul>
      </div>
    </div>
  );
}
