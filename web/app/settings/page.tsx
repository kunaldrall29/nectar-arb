"use client";

import { useEffect, useState } from "react";
import { ChainNotice, useLiveData } from "@/components/Bits";
import { getJson } from "@/lib/api";
import { shortAddr } from "@/lib/format";

type Networks = {
  deployment: Record<string, string | number | boolean | null>;
  demo: { enabled: boolean; maker: string | null; keeper: string | null; keeperNote: string };
  networks: Array<{ id: string; chainId: number; name: string; status: string; detail: string }>;
};

export default function SettingsPage() {
  const { wallet, mode, demoEnabled } = useLiveData();
  const [networks, setNetworks] = useState<Networks | null>(null);
  useEffect(() => {
    getJson<Networks>("/nectar-api/v1/networks").then(setNetworks).catch(() => setNetworks(null));
  }, []);
  const deployment = networks?.deployment;
  const fields = [
    ["Escrow", deployment?.escrow],
    ["Quotes", deployment?.quotes],
    ["Executor", deployment?.executor],
    ["Rehearsal market", deployment?.rehearsalMarket],
    ["Debt token", deployment?.debtToken],
    ["Collateral token", deployment?.collateralToken],
    ["Pause guardian", deployment?.pauseGuardian],
    ["Oracle / guardian", deployment?.oracle],
    ["Protocol fee recipient", deployment?.protocolFeeRecipient],
  ] as const;
  return (
    <>
      <h1>Settings</h1>
      <p className="lede">Wallet, network, and the deployment this session is reading. Routine actions do not need an RPC URL.</p>
      <ChainNotice />
      <section className="panel">
        <h2>Wallet</h2>
        <div className="row"><span>Mode</span><span>{mode === "rehearsal" ? "Local rehearsal signer" : "Injected wallet"}</span></div>
        <div className="row"><span>Address</span><span>{wallet ?? "None"}</span></div>
        <div className="row"><span>Rehearsal signer available</span><span>{demoEnabled ? "Yes, Anvil only" : "No"}</span></div>
        <p className="hint">{networks?.demo.keeperNote}</p>
      </section>
      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Networks</h2>
        {networks?.networks.map((network) => (
          <div className="row" key={network.id}>
            <span>{network.name}<br />{network.detail}</span>
            <span>{network.status}<br />{network.chainId}</span>
          </div>
        ))}
      </section>
      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Contracts</h2>
        <p className="hint">
          Scope {String(deployment?.scope ?? "hackathon-r1")}. Audited: no. The EVM system is a new implementation.
          Earlier Stellar liquidation work does not certify these contracts. The guardian can pause new reservations and executions and cannot withdraw maker cash.
          The oracle can change the rehearsal price. There is no proxy admin.
        </p>
        {fields.map(([label, value]) => (
          <div className="row" key={label}>
            <span>{label}</span>
            <span title={String(value ?? "")}>{typeof value === "string" && value.startsWith("0x") ? shortAddr(value) : String(value ?? "—")}</span>
          </div>
        ))}
        <div className="row"><span>Commit</span><span>{String(deployment?.commit ?? "—")}</span></div>
      </section>
    </>
  );
}
