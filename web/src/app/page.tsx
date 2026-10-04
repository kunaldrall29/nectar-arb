"use client";

import Link from "next/link";
import type React from "react";
import { computeAnalytics, formatUnitsExact, shortAddr } from "@nectar/core";
import { useNetwork } from "@/lib/network-context";
import { useChainState } from "@/lib/use-chain-state";

export default function OverviewPage() {
  const { net, slug } = useNetwork();
  const { data, isLoading, isError } = useChainState();

  if (!net.deployment) {
    return (
      <div className="card max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="mt-2 text-zinc-400">{net.note}</p>
        {slug === "arbitrum-sepolia" && (
          <p className="mt-4 text-sm text-zinc-500">
            Fund the deployer wallet with ~0.05 ETH on Arbitrum Sepolia, then run{" "}
            <code className="text-nectar-amber">pnpm deploy:arbitrum-sepolia</code>.
          </p>
        )}
      </div>
    );
  }

  if (isLoading || !data) return <p className="text-zinc-500">Loading chain state…</p>;
  if (isError) return <p className="text-nectar-rose">Unable to read chain — check RPC and deployment.</p>;

  const analytics = computeAnalytics(data, [net.deployment!.deployer]);
  const liq = data.positions.filter((p) => p.status === "liquidatable").length;
  const atRisk = data.positions.filter((p) => p.status === "at-risk").length;
  const activeQuotes = data.quotes.filter((q) => q.state === "Active").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-zinc-500">
          Combined view for {net.chain.name}. Funds and settlement stay on this chain only.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Maker cash (funded)" value={`${formatUnitsExact(data.vault.fundedCash, data.vault.cashToken.decimals, 0)} ${data.vault.cashToken.symbol}`} sub={`${formatUnitsExact(data.vault.reservedCash, data.vault.cashToken.decimals, 0)} reserved`} />
        <Stat label="Active quotes" value={String(activeQuotes)} sub={`${data.markets.length} admitted markets`} />
        <Stat label="Positions" value={`${liq} liquidatable`} sub={`${atRisk} at-risk · ${data.positions.length} total`} />
        <Stat label="Settlements" value={String(analytics.measured.settlements)} sub={`${formatUnitsExact(analytics.measured.recoveredDebt, data.vault.cashToken.decimals, 0)} debt recovered`} data-testid="stat-settlements" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-medium text-nectar-amber">Executable opportunities</h2>
          <p className="mt-1 text-sm text-zinc-500">Debt that is liquidatable and covered by a funded quote right now.</p>
          <p className="mt-4 text-3xl font-semibold">
            {formatUnitsExact(
              data.markets.reduce((a, m) => a + BigInt(m.executableDebt), 0n).toString(),
              data.vault.cashToken.decimals,
              0,
            )}{" "}
            {data.vault.cashToken.symbol}
          </p>
          <Link href="/markets" className="btn-primary mt-4 inline-flex">
            View markets
          </Link>
        </div>
        <div className="card p-5">
          <h2 className="font-medium">Operational status</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-400">
            <li>Executor jobs settled: {data.executor.jobsSettled}</li>
            <li>Keeper allowlist: {data.keeperAllowlistEnabled ? "enabled (pilot)" : "open"}</li>
            <li>Global pause: reservations {data.globalPause.reservations ? "paused" : "open"} · executions {data.globalPause.executions ? "paused" : "open"}</li>
            <li>Treasury {shortAddr(data.treasury)} · Guardian {shortAddr(data.guardian)}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  ...rest
}: {
  label: string;
  value: string;
  sub: string;
} & React.ComponentProps<"div">) {
  return (
    <div className="card p-4" {...rest}>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-500">{sub}</div>
    </div>
  );
}
