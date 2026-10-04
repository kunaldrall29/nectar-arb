"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi-config";
import { NetworkProvider } from "@/lib/network-context";
import { DemoCaptionOverlay, DemoWalletProvider, isDemoMode, useDemoWallet } from "@/lib/demo-wallet";
import { DemoAutoNetwork } from "@/components/demo-auto-network";

function DemoShell({ children }: { children: ReactNode }) {
  return (
    <DemoWalletProvider>
      <NetworkProvider>
        <DemoAutoNetwork />
        <DemoCaptionOverlay />
        {children}
      </NetworkProvider>
    </DemoWalletProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  if (isDemoMode) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <DemoShell>{children}</DemoShell>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: "#f5b942", borderRadius: "medium" })}>
          <NetworkProvider>{children}</NetworkProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function DemoWalletBadge() {
  const demo = useDemoWallet();
  if (!demo) return null;
  return (
    <span className="badge border border-nectar-amber/50 bg-nectar-amber/10 font-mono text-xs text-nectar-amber">
      Demo wallet {demo.address.slice(0, 6)}…{demo.address.slice(-4)}
    </span>
  );
}
