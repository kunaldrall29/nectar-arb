"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function TxPage() {
  const { hash } = useParams<{ hash: string }>();
  const [execs, setExecs] = useState<unknown[]>([]);

  useEffect(() => {
    void fetch("/api/executions").then((r) => r.json()).then((d) => setExecs(d.executions ?? []));
  }, []);

  const match = (execs as { txHash?: string; state?: string }[]).find(
    (e) => e.txHash?.toLowerCase() === hash?.toLowerCase(),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Transaction</h1>
      <p className="font-mono text-sm break-all text-slate-400">{hash}</p>
      {match ? (
        <div className="rounded-xl border border-nectar-border bg-nectar-panel p-4 text-sm">
          <p>Status: <span className="text-emerald-300">{match.state}</span></p>
          <p className="mt-2 text-slate-400">Indexed from Nectar event store / bundled snapshot.</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Not found in snapshot — may be pending or on an unindexed network.</p>
      )}
    </div>
  );
}
