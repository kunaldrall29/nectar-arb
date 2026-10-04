"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { anvilLocal, robinhoodTestnet } from "@nectar/core";
import { arbitrumSepolia } from "viem/chains";
import { http } from "wagmi";

export const wagmiConfig = getDefaultConfig({
  appName: "Nectar",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000",
  chains: [anvilLocal, arbitrumSepolia, robinhoodTestnet],
  transports: {
    [anvilLocal.id]: http(anvilLocal.rpcUrls.default.http[0]),
    [arbitrumSepolia.id]: http(arbitrumSepolia.rpcUrls.default.http[0]),
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});
