import manifest from "../../../../deployments/manifest.json";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "421614");
export const deployment = manifest.networks.find((n) => n.chainId === CHAIN_ID && n.status === "active");
export const contracts = deployment?.contracts;
export const MARKET_KEY = deployment?.marketKey as `0x${string}` | undefined;
