"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Job = {
  id: string;
  status: string;
  txHash?: string;
  refusalReason?: string;
  createdAt: string;
  job: Record<string, string>;
};

type Receipt = {
  id: string;
  debtRepaid: string;
  collateralSeized: string;
  txHash: string;
  createdAt: string;
};

export default function ExecutionsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  useEffect(() => {
    Promise.all([
      apiGet<{ data: Job[] }>("/v1/jobs"),
      apiGet<{ data: Receipt[] }>("/v1/receipts")
    ])
      .then(([j, r]) => {
        setJobs(j.data);
        setReceipts(r.data);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8">
      <h1 className="display text-4xl text-[var(--honey)]">Executions</h1>
      <p className="mt-2 max-w-2xl text-[var(--fog)]">
        Jobs move from observed → simulated → submitted → included → finalized. Wallet rejections are
        not failed liquidations.
      </p>

      <h2 className="display mt-10 text-2xl text-[var(--mist)]">Jobs</h2>
      <div className="mt-4 space-y-3">
        {jobs.length === 0 && <p className="text-[var(--fog)]">No jobs yet — run a demo liquidation.</p>}
        {jobs.map((j) => (
          <article key={j.id} className="panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{j.status}</p>
              <p className="text-xs text-[var(--fog)]">{new Date(j.createdAt).toLocaleString()}</p>
            </div>
            {j.txHash && (
              <a
                className="mt-2 inline-block break-all font-mono text-xs text-[var(--nectar-bright)]"
                href={`https://sepolia.arbiscan.io/tx/${j.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {j.txHash}
              </a>
            )}
            {j.refusalReason && <p className="mt-2 text-sm text-[var(--danger)]">{j.refusalReason}</p>}
          </article>
        ))}
      </div>

      <h2 className="display mt-10 text-2xl text-[var(--mist)]">Receipts</h2>
      <div className="mt-4 space-y-3">
        {receipts.map((r) => (
          <article key={r.id} className="panel">
            <p className="text-sm text-[var(--fog)]">Debt repaid {Number(r.debtRepaid) / 1e6} nUSD</p>
            <p className="text-sm text-[var(--fog)]">
              Collateral seized {(Number(r.collateralSeized) / 1e18).toFixed(4)} tAAPL
            </p>
            <p className="mt-2 break-all font-mono text-xs text-[var(--nectar-bright)]">{r.txHash}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
