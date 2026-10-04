"use client";

import { useEffect, useState } from "react";
import { API_URL, apiGet } from "@/lib/api";

type Deployment = {
  chainId?: number;
  network?: string;
  rpcUrl?: string;
  deployer?: string;
  contracts?: Record<string, string>;
  marketKey?: string;
};

export default function SettingsPage() {
  const [dep, setDep] = useState<Deployment | null>(null);
  const [fund, setFund] = useState<string>("");

  useEffect(() => {
    apiGet<{ data: Deployment; fundWallet: string }>("/v1/deployment")
      .then((r) => {
        setDep(r.data);
        setFund(r.fundWallet);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8">
      <h1 className="display text-4xl text-[var(--honey)]">Settings</h1>
      <p className="mt-2 max-w-2xl text-[var(--fog)]">
        Network and deployment details for the testnet prototype. Product users do not need raw RPC
        configuration for routine actions.
      </p>

      <div className="panel mt-8 space-y-3">
        <p>
          <span className="text-[var(--fog)]">API</span> · {API_URL}
        </p>
        <p>
          <span className="text-[var(--fog)]">Network</span> · {dep?.network ?? "—"} (chain{" "}
          {dep?.chainId ?? "—"})
        </p>
        <p>
          <span className="text-[var(--fog)]">Keeper allowlist</span> · enabled (pilot)
        </p>
        <p className="break-all">
          <span className="text-[var(--fog)]">Fund deployer</span> · {fund}
        </p>
      </div>

      {dep?.contracts && (
        <div className="panel mt-4">
          <h2 className="display text-xl text-[var(--mist)]">Contracts</h2>
          <ul className="mt-3 space-y-2 font-mono text-xs text-[var(--fog)]">
            {Object.entries(dep.contracts).map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
