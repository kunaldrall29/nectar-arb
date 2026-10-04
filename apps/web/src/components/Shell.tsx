"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { CHAIN_ID } from "@/lib/config";

const nav = [
  { href: "/", label: "Overview" },
  { href: "/markets", label: "Markets" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/executions", label: "Executions" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { address, isConnected, connect, disconnect, chainId, switchChain } = useWallet();
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  return (
    <div>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          backdropFilter: "blur(8px)",
          background: "color-mix(in srgb, var(--bg) 85%, transparent)",
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0.75rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <div>
              <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>Nectar</div>
              <span className="badge testnet">Testnet rehearsal · not production</span>
            </div>
            <div style={{ display: "flex", gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
              {wrongNetwork && (
                <button type="button" className="secondary" onClick={() => switchChain()}>
                  Switch network
                </button>
              )}
              {isConnected ? (
                <>
                  <span className="badge">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
                  <button type="button" className="secondary" onClick={() => disconnect()}>Disconnect</button>
                </>
              ) : (
                <button type="button" onClick={() => connect().catch(console.error)}>Connect wallet</button>
              )}
            </div>
          </div>
          <nav style={{ display: "flex", gap: 0.75, marginTop: 0.75, overflowX: "auto", paddingBottom: 0.25 }}>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "0.35rem 0.55rem",
                  borderRadius: 8,
                  fontSize: 0.9,
                  color: pathname === item.href ? "var(--accent2)" : "var(--muted)",
                  border: pathname === item.href ? "1px solid var(--border)" : "1px solid transparent",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
