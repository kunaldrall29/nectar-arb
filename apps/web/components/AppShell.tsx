"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";

const LINKS = [
  ["/overview", "Overview"],
  ["/markets", "Markets"],
  ["/liquidity", "Liquidity"],
  ["/executions", "Executions"],
  ["/analytics", "Analytics"],
  ["/settings", "Settings"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const demo = connectors.find((c) => c.id === "nectar-demo");

  return (
    <>
      <div className="nc-banner">
        PUBLIC TESTNET · R1 vertical slice toward R2 · Arbitrum Sepolia is the live demo chain ·
        Robinhood Chain Testnet is shown in the same workspace · funds never cross chains · Morpho
        markets here are MOCK and labeled
      </div>
      <header className="nc-top">
        <Link href="/" className="nc-brand">
          <span className="nc-mark" />
          Nectar
        </Link>
        <nav className="nc-nav">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nc-right">
          <span className="nc-pill">TESTNET</span>
          <span className="nc-pill">{chainId ? `chain ${chainId}` : "no wallet"}</span>
          {isConnected ? (
            <>
              <span className="mono" style={{ fontSize: 12 }}>
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
              {chainId && chainId !== 421614 && chainId !== 31337 ? (
                <button className="nc-btn-gold" onClick={() => switchChain({ chainId: 421614 })}>
                  Switch to Arb Sepolia
                </button>
              ) : null}
              <button className="nc-btn-ghost" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button className="nc-btn" onClick={() => connect({ connector: injected() })}>
                Connect wallet
              </button>
              {demo ? (
                <button className="nc-btn-gold" onClick={() => connect({ connector: demo })}>
                  Rehearsal wallet
                </button>
              ) : null}
            </>
          )}
        </div>
      </header>
      {children}
    </>
  );
}

export function NetworkFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="filter">
      {["all", "421614", "46630", "31337"].map((id) => (
        <button key={id} className={value === id ? "on" : ""} onClick={() => onChange(id)}>
          {id === "all" ? "All networks" : id === "421614" ? "Arbitrum" : id === "46630" ? "Robinhood Chain" : "Local Anvil"}
        </button>
      ))}
    </div>
  );
}
