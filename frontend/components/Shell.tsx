"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { AgentDock } from "./AgentDock";

const NAV = [
  ["Overview", "/"],
  ["Markets", "/markets"],
  ["Liquidity", "/liquidity"],
  ["Executions", "/executions"],
  ["Analytics", "/analytics"],
  ["Agent", "/agent"],
  ["Settings", "/settings"],
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-nectar-line/80 bg-[#0c0a08]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-nectar-gold text-[#2a1608] font-display text-lg">
              N
            </span>
            <span className="font-display text-xl tracking-tight">Nectar</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map(([label, href]) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    active ? "bg-nectar-gold/15 text-nectar-honey" : "text-nectar-mist hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-full border border-nectar-gold/40 bg-nectar-gold/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-nectar-honey">
              Stellar testnet
            </span>
            <WalletButton />
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 md:hidden">
          {NAV.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-full border border-nectar-line px-3 py-1 text-xs text-nectar-mist"
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <AgentDock />
    </div>
  );
}
