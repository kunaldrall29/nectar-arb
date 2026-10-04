"use client";

import { useEffect, useState } from "react";
import { ChainNotice, useLiveData } from "@/components/Bits";
import { getJson } from "@/lib/api";
import { shortAddr } from "@/lib/format";
import { ZERODEV_BUNDLER_RPC, ZERODEV_PROJECT_ID, createSepoliaKernelClient } from "@/lib/zerodev";

type RobinhoodContracts = {
  escrow: string;
  quotes: string;
  executor: string;
  rehearsalMarket: string;
  debtToken: string;
  collateralToken: string;
  pauseGuardian: string;
  figures: null;
  figuresReason: string;
};

type Networks = {
  deployment: Record<string, string | number | boolean | null>;
  demo: { enabled: boolean; maker: string | null; keeper: string | null; keeperNote: string };
  officialDebt: Array<{ chainId: number; network: string; address: string; symbol: string; decimals: number }>;
  networks: Array<{ id: string; chainId: number; name: string; status: string; detail: string; contracts?: RobinhoodContracts }>;
};

export default function SettingsPage() {
  const { wallet, mode, demoEnabled, filter } = useLiveData();
  const [networks, setNetworks] = useState<Networks | null>(null);
  const [kernel, setKernel] = useState<string | null>(null);
  const [kernelError, setKernelError] = useState<string | null>(null);
  const [kernelBusy, setKernelBusy] = useState(false);
  useEffect(() => {
    getJson<Networks>("/nectar-api/v1/networks").then(setNetworks).catch(() => setNetworks(null));
  }, []);
  const deployment = networks?.deployment;
  const robinhood = networks?.networks.find((item) => item.id === "robinhood-testnet")?.contracts;
  const showRobinhood = filter !== "arbitrum-sepolia";
  const showConnected = filter !== "robinhood-testnet";
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
        <h2>ZeroDev · Arbitrum Sepolia</h2>
        <div className="row"><span>Project</span><span>{ZERODEV_PROJECT_ID}</span></div>
        <div className="row"><span>Bundler</span><span style={{ wordBreak: "break-all" }}>{ZERODEV_BUNDLER_RPC}</span></div>
        <p className="hint">Kernel client uses @zerodev/sdk and the ECDSA validator. A session key is generated in the browser and is not stored.</p>
        {kernelError ? <p className="alert" role="alert">{kernelError}</p> : null}
        {kernel ? <p className="oknote">Kernel account {kernel}</p> : null}
        <div className="actions">
          <button
            className="solid"
            type="button"
            disabled={kernelBusy}
            onClick={() => {
              setKernelBusy(true);
              setKernelError(null);
              void createSepoliaKernelClient()
                .then((result) => setKernel(result.address))
                .catch((error: unknown) => setKernelError(error instanceof Error ? error.message : "Kernel client was not created."))
                .finally(() => setKernelBusy(false));
            }}
          >
            {kernelBusy ? "Creating kernel account" : "Create kernel account"}
          </button>
        </div>
      </section>
      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Official USDG</h2>
        {networks?.officialDebt.map((asset) => (
          <div className="row" key={asset.chainId}>
            <span>{asset.network} · {asset.symbol}</span>
            <span>{asset.decimals} decimals<br />{shortAddr(asset.address)}</span>
          </div>
        ))}
      </section>
      {showRobinhood && robinhood ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <h2>Robinhood Chain testnet contracts</h2>
          <p className="hint">{robinhood.figuresReason}</p>
          {(
            [
              ["Escrow", robinhood.escrow],
              ["Quotes", robinhood.quotes],
              ["Executor", robinhood.executor],
              ["Rehearsal market", robinhood.rehearsalMarket],
              ["Rehearsal nUSD", robinhood.debtToken],
              ["Rehearsal nSTK", robinhood.collateralToken],
              ["Pause guardian", robinhood.pauseGuardian],
            ] as const
          ).map(([label, value]) => (
            <div className="row" key={label}>
              <span>{label}</span>
              <span title={value}>{shortAddr(value)}</span>
            </div>
          ))}
        </section>
      ) : null}
      {showConnected ? (
      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Connected session contracts</h2>
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
      ) : null}
    </>
  );
}
