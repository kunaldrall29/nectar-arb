"use client";

import { LIVE } from "@/lib/config";
import { usd } from "@/lib/format";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-nectar-honey">Analytics</h1>
        <p className="mt-2 max-w-2xl text-nectar-mist">
          Measured outcomes, estimates, and simulations are separated. Testnet activity is never production revenue.
          Self-operated makers and keepers are labeled.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Box title="Measured — recovered debt" value={usd(LIVE.receipt.debtRepay)} note="From included settlement 969bb595…" />
        <Box title="Measured — protocol fee" value={usd(LIVE.receipt.protocolFee)} note="Realized only after the fee transfer" />
        <Box title="Estimate — testnet volume" value="$148k+" note="Network traction, not this rehearsal alone" />
        <Box title="Simulation — AMM comparison" value="$9,820 vs $10,140" note="Section 9 fixture. Not a forecast." />
      </div>
    </div>
  );
}

function Box({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="panel rounded-2xl p-5">
      <div className="text-xs uppercase tracking-[0.16em] text-nectar-mist">{title}</div>
      <div className="mt-2 font-display text-3xl">{value}</div>
      <div className="mt-2 text-sm text-nectar-mist">{note}</div>
    </div>
  );
}
