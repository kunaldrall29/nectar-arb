"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => connect({ connector: connectors[0] })}
        className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50"
      >
        Connect wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => switchChain?.({ chainId: 421614 })}
        className="hidden rounded border border-nectar-border px-2 py-1 text-slate-400 sm:inline"
        title="Switch network before signing"
      >
        {chain?.name ?? "Network"}
      </button>
      <span className="max-w-[120px] truncate text-slate-300" title={address}>
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>
      <button type="button" onClick={() => disconnect()} className="text-slate-500 hover:text-white">
        Disconnect
      </button>
    </div>
  );
}
