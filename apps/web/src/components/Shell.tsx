"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "@/components/ConnectWallet";

const links = [
  { href: "/", label: "Overview" },
  { href: "/markets", label: "Markets" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/executions", label: "Executions" },
  { href: "/settings", label: "Settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-nectar-panel/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap items-center gap-4 justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-nectar-mint">Testnet · Arbitrum Sepolia</p>
            <h1 className="text-xl font-semibold text-nectar-accent">Nectar</h1>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1 rounded-full ${pathname === l.href ? "bg-nectar-accent text-black" : "bg-white/5 hover:bg-white/10"}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <ConnectWallet />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
