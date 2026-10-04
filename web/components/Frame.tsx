"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/", "Home"],
  ["/overview", "Overview"],
  ["/markets", "Markets"],
  ["/liquidity/quotes", "Liquidity quotes"],
  ["/liquidity/pools", "Liquidity pools"],
  ["/executions", "Executions"],
  ["/analytics", "Analytics"],
  ["/lab", "Testnet Lab"],
  ["/settings", "Settings"],
];

export function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="frame">
      <aside className="rail">
        <div className="brand">
          <img src="/brand/nectar-mark.svg" alt="Nectar mark" />
          <div>
            <strong>Nectar</strong>
            <span>Funded liquidation liquidity</span>
          </div>
        </div>
        <nav className="nav">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main">
        <div className="top">
          <span className="pill">Testnet</span>
          <span className="hint">Chain selection changes the environment. Balances are not combined.</span>
        </div>
        {children}
      </div>
    </div>
  );
}
