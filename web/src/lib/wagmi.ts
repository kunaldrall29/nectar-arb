"use client";

import { createConfig, http } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const robinhoodTestnet = {
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
} as const;

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia, robinhoodTestnet],
  connectors: [injected()],
  transports: {
    [arbitrumSepolia.id]: http(),
    [robinhoodTestnet.id]: http(),
  },
  ssr: true,
});
