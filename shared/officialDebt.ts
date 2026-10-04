/** Paxos Global Dollar. Read from chain; these are not rehearsal stand-ins named USDG. */
export const OFFICIAL_USDG = [
  {
    chainId: 46630,
    network: "Robinhood Chain testnet",
    address: "0x7E955252E15c84f5768B83c41a71F9eba181802F",
    symbol: "USDG",
    decimals: 6,
    name: "Global Dollar",
    issuer: "Paxos",
  },
  {
    chainId: 421614,
    network: "Arbitrum Sepolia",
    address: "0xFFC95faa3d63Cde504a05B567C600B78C0b41892",
    symbol: "USDG",
    decimals: 6,
    name: "Global Dollar",
    issuer: "Paxos",
  },
] as const;
