"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ConnectButton } from "./ConnectButton";
import { NetworkFilter, useNetworkFilter } from "./NetworkFilter";

const nav = [
  { href: "/", label: "Overview" },
  { href: "/markets", label: "Markets" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/executions", label: "Executions" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { family, setFamily } = useNetworkFilter();

  return (
    <div className="min-h-screen bg-nectar-bg text-slate-100">
      <header className="sticky top-0 z-40 border-b border-nectar-border bg-nectar-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              N
            </span>
            Nectar
          </Link>
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-300">
            Testnet
          </span>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-md px-2.5 py-1.5 transition",
                  path === item.href ? "bg-nectar-panel text-white" : "text-slate-400 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <NetworkFilter value={family} onChange={setFamily} />
          <ConnectButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="border-t border-nectar-border py-6 text-center text-xs text-slate-500">
        Hackathon / testnet slice — mock lending, oracle & tokens. Not production.
      </footer>
    </div>
  );
}
