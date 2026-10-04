"use client";

import { computeAnalytics, formatUnitsExact } from "@nectar/core";
import { useNetwork } from "@/lib/network-context";
import { useChainState } from "@/lib/use-chain-state";

export default function AnalyticsPage() {
  const { net } = useNetwork();
  const d = net.deployment;
  const { data } = useChainState();

  if (!d) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="mt-2 text-zinc-400">{net.note}</p>
      </div>
    );
  }

  if (!data) return <p className="text-zinc-500">Loading…</p>;

  const a = computeAnalytics(data, [d.deployer]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-nectar-amber">{a.label}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric title="Recovered debt" value={formatUnitsExact(a.measured.recoveredDebt, data.vault.cashToken.decimals, 0)} unit={data.vault.cashToken.symbol} />
        <Metric title="Protocol revenue (fees)" value={formatUnitsExact(a.measured.protocolRevenue, data.vault.cashToken.decimals, 2)} unit={data.vault.cashToken.symbol} />
        <Metric title="Keeper compensation" value={formatUnitsExact(a.measured.keeperCompensation, data.vault.cashToken.decimals, 2)} unit={data.vault.cashToken.symbol} />
        <Metric title="Quote fill rate" value={a.measured.quoteFillRate} unit="" />
        <Metric title="Team-operated makers" value={String(a.measured.teamOperatedMakers)} unit={`of ${a.measured.uniqueMakers} makers`} />
        <Metric title="Unserved exposure" value={formatUnitsExact(a.capacity.unservedExposure, data.vault.cashToken.decimals, 0)} unit={data.vault.cashToken.symbol} />
      </div>
      <div className="card p-5">
        <h2 className="font-medium">Recovered by day</h2>
        <ul className="mt-3 space-y-1 text-sm text-zinc-400">
          {a.recoveredByDay.map((row) => (
            <li key={row.day}>
              {row.day}: {formatUnitsExact(row.recoveredDebt, data.vault.cashToken.decimals, 0)} {data.vault.cashToken.symbol}
            </li>
          ))}
          {!a.recoveredByDay.length && <li>No measured settlements yet.</li>}
        </ul>
      </div>
      <p className="text-xs text-zinc-600">
        Founder-stated historical testnet volume on prior Stellar deployments ($148k+) is separate from these EVM measurements.
      </p>
    </div>
  );
}

function Metric({ title, value, unit }: { title: string; value: string; unit: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase text-zinc-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value} {unit && <span className="text-sm font-normal text-zinc-500">{unit}</span>}
      </div>
    </div>
  );
}
