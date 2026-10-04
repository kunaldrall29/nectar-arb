"use client";

import { Shell } from "@/components/Shell";
import { deployment } from "@/lib/contracts";
import { API_BASE } from "@/wagmi";

export default function SettingsPage() {
  return (
    <Shell>
      <h2 className="text-2xl font-semibold mb-4">Settings</h2>
      <div className="space-y-4 text-sm">
        <p>Network: Arbitrum Sepolia (chainId {deployment.chainId})</p>
        <p>API: {API_BASE}</p>
        <p className="text-slate-400">RPC endpoints are configured server-side; makers sign only on the selected chain.</p>
        <pre className="text-xs bg-nectar-panel border border-white/10 p-4 rounded-xl overflow-auto">{JSON.stringify(deployment, null, 2)}</pre>
      </div>
    </Shell>
  );
}
