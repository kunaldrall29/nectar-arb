"use client";

import { useNetwork } from "@/lib/network-context";
import type { NetworkSlug } from "@nectar/core";

export default function SettingsPage() {
  const { all, slug, setSlug, net } = useNetwork();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-500">Wallet connection uses RainbowKit. RPC reads go directly to the selected chain.</p>
      </div>
      <div className="card space-y-4 p-5">
        <h2 className="font-medium">Network</h2>
        <p className="text-xs text-zinc-500">Switching networks changes what you see — not where funds are held (UX01).</p>
        <div className="space-y-2">
          {all.map((n) => (
            <label key={n.slug} className="flex cursor-pointer items-start gap-3 rounded-lg border border-nectar-border p-3 hover:bg-white/5">
              <input
                type="radio"
                name="network"
                checked={slug === n.slug}
                onChange={() => setSlug(n.slug as NetworkSlug)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">
                  {n.family} · {n.chain.name}
                  {n.status === "coming-soon" && <span className="ml-2 badge bg-zinc-700 text-zinc-300">Coming soon</span>}
                </div>
                <p className="text-xs text-zinc-500">{n.note}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div className="card space-y-2 p-5 text-sm text-zinc-400">
        <h2 className="font-medium text-zinc-200">Disclosures</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Nectar received approximately $75,000 in grant funding for the original Stellar/Soroban protocol.</li>
          <li>That work underwent a security audit; this new EVM deployment is not certified by that audit.</li>
          <li>Testnet uses mock lending markets and mock oracle prices (PX05).</li>
          <li>Keeper allowlist may be enabled on pilot deployments — check operational status on Overview.</li>
        </ul>
        {net.deployment && (
          <p className="pt-2 font-mono text-xs text-zinc-500">
            Executor {net.deployment.executor} · Vault {net.deployment.vault}
          </p>
        )}
      </div>
    </div>
  );
}
