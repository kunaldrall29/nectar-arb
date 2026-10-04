"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPublicClient, custom, type Address } from "viem";
import { CHAIN_ID } from "@/lib/config";

type WalletCtx = {
  address?: Address;
  chainId?: number;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  publicClient?: ReturnType<typeof createPublicClient>;
};

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();

  const publicClient = useMemo(() => {
    if (typeof window === "undefined" || !window.ethereum) return undefined;
    return createPublicClient({ transport: custom(window.ethereum) });
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.on?.("accountsChanged", (...args: unknown[]) => {
      const accs = args[0] as string[];
      setAddress(accs[0] as Address);
    });
    window.ethereum.on?.("chainChanged", (...args: unknown[]) => {
      const hex = args[0] as string;
      setChainId(parseInt(hex, 16));
    });
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error("No wallet");
    const accs = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    const cid = (await window.ethereum.request({ method: "eth_chainId" })) as string;
    setAddress(accs[0] as Address);
    setChainId(parseInt(cid, 16));
  }, []);

  const disconnect = useCallback(() => {
    setAddress(undefined);
    setChainId(undefined);
  }, []);

  const switchChain = useCallback(async () => {
    if (!window.ethereum) return;
    const hex = `0x${CHAIN_ID.toString(16)}`;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: "Arbitrum Sepolia (Nectar rehearsal)",
            rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"],
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          },
        ],
      });
    }
    setChainId(CHAIN_ID);
  }, []);

  const value: WalletCtx = {
    address,
    chainId,
    isConnected: Boolean(address),
    connect,
    disconnect,
    switchChain,
    publicClient,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet outside provider");
  return ctx;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
    };
  }
}
