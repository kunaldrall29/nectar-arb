"use client";

import { anvilLocal, type Deployment } from "@nectar/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Chain,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hash,
  type Hex,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** Well-known Anvil account #0 — local demo only (NEXT_PUBLIC_NECTAR_DEMO=1). */
const DEFAULT_DEMO_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

export const isDemoMode = process.env.NEXT_PUBLIC_NECTAR_DEMO === "1";

type WriteArgs = {
  address: Address;
  abi: Abi;
  functionName: ContractFunctionName;
  args?: ContractFunctionArgs;
};

type DemoCtx = {
  enabled: true;
  address: Address;
  chainId: number;
  writeContract: (req: WriteArgs) => Promise<Hash>;
  waitForTx: (hash: Hash) => Promise<void>;
  caption: string;
  setCaption: (t: string) => void;
};

const DemoCtx = createContext<DemoCtx | null>(null);

export function DemoWalletProvider({ children }: { children: ReactNode }) {
  const key = (process.env.NEXT_PUBLIC_DEMO_PRIVATE_KEY as Hex | undefined) ?? DEFAULT_DEMO_KEY;
  const account = useMemo(() => privateKeyToAccount(key), [key]);
  const [caption, setCaption] = useState("");

  const { wallet, publicClient } = useMemo(() => {
    const rpc =
      typeof window !== "undefined" ? `${window.location.origin}/api/rpc` : anvilLocal.rpcUrls.default.http[0];
    const transport = http(rpc, { retryCount: 2 });
    return {
      wallet: createWalletClient({ account, chain: anvilLocal, transport }),
      publicClient: createPublicClient({ chain: anvilLocal, transport }),
    };
  }, [account]);

  const writeContract = useCallback(
    async (req: WriteArgs) => {
      return wallet.writeContract({
        address: req.address,
        abi: req.abi,
        functionName: req.functionName,
        args: req.args as never,
        chain: anvilLocal,
      });
    },
    [wallet],
  );

  const waitForTx = useCallback(
    async (hash: Hash) => {
      await publicClient.waitForTransactionReceipt({ hash });
    },
    [publicClient],
  );

  const value: DemoCtx = {
    enabled: true,
    address: account.address,
    chainId: anvilLocal.id,
    writeContract,
    waitForTx,
    caption,
    setCaption,
  };

  return <DemoCtx.Provider value={value}>{children}</DemoCtx.Provider>;
}

export function useDemoWallet() {
  return useContext(DemoCtx);
}

/** Exposed for Playwright to set section titles during recording. */
export function setDemoCaption(title: string) {
  if (typeof window !== "undefined") {
    (window as unknown as { __NECTAR_DEMO_CAPTION?: string }).__NECTAR_DEMO_CAPTION = title;
    window.dispatchEvent(new CustomEvent("nectar-demo-caption", { detail: title }));
  }
}

export function DemoCaptionOverlay() {
  const demo = useDemoWallet();
  const [title, setTitle] = useState("");

  useEffect(() => {
    const sync = () => setTitle((window as unknown as { __NECTAR_DEMO_CAPTION?: string }).__NECTAR_DEMO_CAPTION ?? "");
    sync();
    window.addEventListener("nectar-demo-caption", sync as EventListener);
    return () => window.removeEventListener("nectar-demo-caption", sync as EventListener);
  }, []);

  useEffect(() => {
    if (demo?.caption) setTitle(demo.caption);
  }, [demo?.caption]);

  if (!isDemoMode || !title) return null;
  return (
    <div
      data-testid="demo-caption"
      className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4"
    >
      <div className="rounded-lg border border-nectar-amber/40 bg-black/80 px-6 py-3 text-center shadow-lg backdrop-blur">
        <p className="text-sm font-semibold tracking-wide text-nectar-amber">{title}</p>
      </div>
    </div>
  );
}
