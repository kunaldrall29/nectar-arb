"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNetworkFilter } from "@/components/NetworkFilter";
import { filterByFamily, formatUsd6 } from "@/lib/data";

type Ex = {
  txHash: string;
  network: string;
  family: string;
  state: string;
  repaidAssets?: string;
  cashOut?: string;
  keeper?: string;
};

export default function ExecutionsPage() {
  const { family } = useNetworkFilter();
  const [rows, setRows] = useState<Ex[]>([]);

  useEffect(() => {
    void fetch("/api/executions").then((r) => r.json()).then((d) => setRows(d.executions ?? []));
  }, []);

  const filtered = filterByFamily(rows, family === "all" ? "all" : family);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Executions</h1>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No settlements indexed yet.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((e) => (
            <li key={e.txHash} className="rounded-xl border border-nectar-border bg-nectar-panel p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">{e.state}</span>
                <span className="text-slate-500">{e.network}</span>
              </div>
              <p className="mt-2">
                Repaid {formatUsd6(e.repaidAssets)} · Cash {formatUsd6(e.cashOut)}
              </p>
              <Link href={`/tx/${e.txHash}`} className="mt-2 inline-block text-amber-300 underline">
                View transaction
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
