import { getDeployments } from "@/lib/data";

export default function SettingsPage() {
  const deps = getDeployments();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-slate-400">Wallet connection is in the header. RPC endpoints are preconfigured for testnets.</p>
      <section className="rounded-xl border border-nectar-border bg-nectar-panel p-4 text-sm">
        <h2 className="font-medium">Deployments</h2>
        <ul className="mt-2 space-y-3">
          {deps.map((d) => (
            <li key={d.file} className="border-b border-nectar-border pb-2 last:border-0">
              <p className="font-medium">{d.network}</p>
              <p className="text-xs text-slate-500">Chain {d.chainId} · {d.mode ?? "testnet"}</p>
              <p className="mt-1 font-mono text-xs break-all">Executor: {d.contracts.NectarExecutor}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
