import manifest from "./manifest.json";
import rehearsal from "./rehearsal.json";

export const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK_PASSPHRASE || manifest.networkPassphrase;
export const RPC_URL = process.env.STELLAR_RPC_URL || manifest.rpc;
export const HORIZON_URL = process.env.STELLAR_HORIZON_URL || manifest.horizon;
export const EXPLORER = manifest.explorer;
export const ADMIN_PUBLIC = manifest.admin;
export const CONTRACTS = manifest.contracts;
export const MARKET_KEY = manifest.marketKey;
export const CHAIN_ID = manifest.chainId;
export const LIVE = rehearsal;

export const NETWORKS = [
  {
    id: "stellar-testnet",
    chainId: 1000,
    name: "Stellar Testnet",
    status: "live",
    label: "TESTNET",
    settlement: true,
    rpc: RPC_URL,
    contracts: CONTRACTS,
  },
  {
    id: "arbitrum-sepolia",
    chainId: 421614,
    name: "Arbitrum Sepolia",
    status: "admission_pending",
    label: "PLANNED",
    settlement: false,
    note: "Same product interfaces. Not activated in this R1 slice.",
  },
  {
    id: "robinhood-testnet",
    chainId: 46630,
    name: "Robinhood Chain Testnet",
    status: "admission_pending",
    label: "PLANNED",
    settlement: false,
    note: "Stock-collateral specialization. Funds stay on that chain when admitted.",
  },
] as const;

export function explorerTx(hash: string) {
  return `${EXPLORER}/tx/${hash}`;
}

export function explorerContract(id: string) {
  return `${EXPLORER}/contract/${id}`;
}

export function explorerAccount(id: string) {
  return `${EXPLORER}/account/${id}`;
}
