"use client";

import { useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { useApi } from "@/lib/useNectar";

export default function SettingsPage() {
  const { address } = useAccount();
  const { connect, connectors } = useConnect();
  const nets = useApi<{ networks: Array<Record<string, unknown>> }>("/api/v1/networks");
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const demo = connectors.find((c) => c.id === "nectar-demo");

  function loadDemo() {
    const trimmed = key.trim();
    if (!trimmed.startsWith("0x") || trimmed.length !== 66) {
      setMsg("Paste a 0x-prefixed 32-byte key. Never use a mainnet key.");
      return;
    }
    localStorage.setItem("nectar.demoKey", trimmed);
    setMsg("Rehearsal key stored in this browser only. Connect with Rehearsal wallet.");
    if (demo) connect({ connector: demo });
  }

  async function siwe() {
    if (!address) return;
    const ch = await fetch("/api/v1/auth/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: address }),
    }).then((r) => r.json());
    setMsg(`SIWE challenge issued (session only): ${ch.nonce?.slice(0, 18)}…`);
  }

  return (
    <main className="nc-page">
      <div className="nc-kicker">Settings</div>
      <h1>Wallet, org, alerts</h1>
      <div className="nc-grid cols-2">
        <div className="nc-card">
          <h3>Wallet</h3>
          <p className="nc-sub">Connected {address || "none"}. Routine actions do not require RPC configuration.</p>
          <button className="nc-btn" onClick={siwe} disabled={!address}>Request SIWE challenge</button>
          <label className="nc-label">Rehearsal private key (local / Anvil only)</label>
          <input className="nc-input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="0x…" />
          <button className="nc-btn-gold" style={{ marginTop: 10 }} onClick={loadDemo}>Load rehearsal signer</button>
          {msg ? <p className="nc-sub">{msg}</p> : null}
        </div>
        <div className="nc-card">
          <h3>Organization roles (stub)</h3>
          <p className="nc-sub">Workspace admin cannot spend another member&apos;s cash. Controlling wallet remains authoritative.</p>
          <h3 style={{ marginTop: 16 }}>Notifications (stub)</h3>
          <p className="nc-sub">POST /v1/alerts stores an in-memory workspace alert. No private keys in notifications.</p>
          <h3 style={{ marginTop: 16 }}>API keys (stub)</h3>
          <p className="nc-sub">Keeper submissions use a scoped bearer token. No API key can authorize a maker withdrawal.</p>
        </div>
      </div>
      <div className="nc-card" style={{ marginTop: 16 }}>
        <h3>Supported networks</h3>
        <table className="nc-table">
          <thead><tr><th>Name</th><th>ID</th><th>Status</th><th>Note</th></tr></thead>
          <tbody>
            {nets.data?.networks?.map((n) => (
              <tr key={String(n.chainId)}>
                <td>{String(n.name)}</td>
                <td>{String(n.chainId)}</td>
                <td>{String(n.status)}</td>
                <td>{String(n.reason || "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
