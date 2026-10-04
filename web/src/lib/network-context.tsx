"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { networkBySlug, type NetworkInfo, type NetworkSlug, networks } from "@nectar/core";
import { isDemoMode } from "@/lib/demo-wallet";

const STORAGE_KEY = "nectar.network";

type Ctx = {
  slug: NetworkSlug;
  net: NetworkInfo;
  setSlug: (s: NetworkSlug) => void;
  all: NetworkInfo[];
};

const NetworkCtx = createContext<Ctx | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const all = useMemo(() => networks(), []);
  const [slug, setSlugState] = useState<NetworkSlug>(isDemoMode ? "local" : "local");

  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_NECTAR_NETWORK as NetworkSlug | undefined;
    const stored = (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) as NetworkSlug | null;
    const initial = isDemoMode
      ? "local"
      : (env ?? stored ?? (process.env.NODE_ENV === "production" ? "arbitrum-sepolia" : "local"));
    if (networkBySlug(initial)) setSlugState(initial);
  }, []);

  const setSlug = useCallback((s: NetworkSlug) => {
    setSlugState(s);
    localStorage.setItem(STORAGE_KEY, s);
  }, []);

  const net = networkBySlug(slug) ?? all[0];

  return <NetworkCtx.Provider value={{ slug, net, setSlug, all }}>{children}</NetworkCtx.Provider>;
}

export function useNetwork() {
  const ctx = useContext(NetworkCtx);
  if (!ctx) throw new Error("useNetwork outside provider");
  return ctx;
}
