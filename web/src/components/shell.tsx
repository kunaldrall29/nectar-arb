"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import clsx from "clsx";
import { Activity, BarChart3, Droplets, LayoutDashboard, Settings, Store } from "lucide-react";
import { useNetwork } from "@/lib/network-context";
import { useChainState } from "@/lib/use-chain-state";
import { formatUnitsExact } from "@nectar/core";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/markets", label: "Markets", icon: Store },
  { href: "/liquidity", label: "Liquidity", icon: Droplets },
  { href: "/executions", label: "Executions", icon: Activity },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { net } = useNetwork();
  const { data, isError, isLoading } = useChainState();

  const envLabel = net.environment === "local" ? "Local dev" : "Public testnet";
  const statusColor =
    net.status === "coming-soon" ? "bg-zinc-600" : net.status === "local" ? "bg-blue-500" : "bg-nectar-mint";

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-nectar-border bg-nectar-panel/40 p-4 md:flex">
        <div className="mb-8">
          <div className="text-lg font-semibold tracking-tight text-nectar-amber">Nectar</div>
          <p className="text-xs text-zinc-500">Liquidation liquidity network</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                path === href ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-[10px] leading-relaxed text-zinc-600">
          Mock lending & prices on testnet. EVM deployment is new and not covered by the Stellar/Soroban audit.
        </p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-nectar-border bg-nectar-bg/90 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx("badge text-black", statusColor)}>{envLabel}</span>
            <span className="badge border border-nectar-border text-zinc-300">{net.family}</span>
            <span className="text-sm text-zinc-400">{net.chain.name}</span>
            {net.status === "coming-soon" && <span className="badge bg-nectar-rose/20 text-nectar-rose">Coming soon</span>}
          </div>
          <div className="flex items-center gap-3">
            {data && !isError && (
              <span className="hidden text-xs text-zinc-500 sm:inline">
                block {data.sourceBlock} · funded{" "}
                {formatUnitsExact(data.vault.fundedCash, data.vault.cashToken.decimals, 0)} {data.vault.cashToken.symbol}
              </span>
            )}
            {(isLoading || isError) && net.deployment && (
              <span className="text-xs text-nectar-rose">{isError ? "RPC unavailable" : "Syncing…"}</span>
            )}
            {!net.deployment && <span className="text-xs text-zinc-500">No deployment on this network</span>}
            <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
