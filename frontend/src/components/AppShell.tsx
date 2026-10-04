"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/markets", label: "Markets" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/executions", label: "Executions" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <div className="grain min-h-screen">
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
        <Link href="/" className="display text-2xl tracking-tight text-[var(--honey)]">
          Nectar
        </Link>
        <nav className="hidden items-center gap-5 text-sm md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link ${pathname === l.href ? "active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="env-pill">Testnet</span>
          {!isLanding && (
            <Link href="/liquidity" className="btn-primary !px-3 !py-2 text-sm">
              Add funds
            </Link>
          )}
        </div>
      </header>
      <main className="relative z-10">{children}</main>
      <footer className="mx-auto mt-16 max-w-6xl px-5 pb-10 text-sm text-[var(--fog)] md:px-8">
        <div className="flex flex-col gap-2 border-t border-white/10 pt-6 md:flex-row md:items-center md:justify-between">
          <p>Nectar · liquidation liquidity that settles</p>
          <p>Arbitrum Sepolia · Robinhood Chain testnet monitored</p>
        </div>
      </footer>
    </div>
  );
}
