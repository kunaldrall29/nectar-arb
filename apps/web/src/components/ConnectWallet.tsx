"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <button
        className="bg-nectar-accent text-black font-medium rounded-lg px-4 py-2 text-sm"
        onClick={() => connect({ connector: connectors[0] })}
        disabled={isPending}
      >
        Connect wallet
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-sm">
      <span className="text-slate-300">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
      {chainId !== arbitrumSepolia.id && (
        <button className="text-amber-300 underline" onClick={() => switchChain({ chainId: arbitrumSepolia.id })}>
          Switch to Arbitrum Sepolia
        </button>
      )}
      <button className="text-slate-400 underline" onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
