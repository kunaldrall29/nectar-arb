import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Account,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { NetworkConfig } from "./config.js";

export interface Net {
  cfg: NetworkConfig;
  chain: Chain;
  client: PublicClient;
  wallet(key: Hex): WalletClient<Transport, Chain, Account>;
}

const cache = new Map<string, Net>();

export function net(cfg: NetworkConfig): Net {
  const hit = cache.get(cfg.key);
  if (hit) return hit;
  const chain = defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  const transport = http(cfg.rpcUrl, { timeout: 10_000, retryCount: 1 });
  const client = createPublicClient({ chain, transport, pollingInterval: 1000 }) as PublicClient;
  const n: Net = {
    cfg,
    chain,
    client,
    wallet: (key: Hex) => createWalletClient({ chain, transport, account: privateKeyToAccount(key) }),
  };
  cache.set(cfg.key, n);
  return n;
}

export const QUOTE_TYPES = {
  Quote: [
    { name: "schemaVersion", type: "uint16" },
    { name: "maker", type: "address" },
    { name: "makerNonce", type: "uint256" },
    { name: "marketKey", type: "bytes32" },
    { name: "adapterVersion", type: "uint32" },
    { name: "borrower", type: "address" },
    { name: "collateralToken", type: "address" },
    { name: "collateralAmount", type: "uint256" },
    { name: "debtToken", type: "address" },
    { name: "cashOut", type: "uint256" },
    { name: "maxDebtRepay", type: "uint256" },
    { name: "collateralRecipient", type: "address" },
    { name: "keeperCompensation", type: "uint256" },
    { name: "protocolFee", type: "uint256" },
    { name: "minNetSurplus", type: "uint256" },
    { name: "keeperRecipient", type: "address" },
    { name: "surplusRecipient", type: "address" },
    { name: "validUntil", type: "uint64" },
    { name: "policyHash", type: "bytes32" },
    { name: "quoteNonce", type: "uint256" },
  ],
} as const;

export interface QuoteTerms {
  schemaVersion: number;
  maker: Hex;
  makerNonce: bigint;
  marketKey: Hex;
  adapterVersion: number;
  borrower: Hex;
  collateralToken: Hex;
  collateralAmount: bigint;
  debtToken: Hex;
  cashOut: bigint;
  maxDebtRepay: bigint;
  collateralRecipient: Hex;
  keeperCompensation: bigint;
  protocolFee: bigint;
  minNetSurplus: bigint;
  keeperRecipient: Hex;
  surplusRecipient: Hex;
  validUntil: bigint;
  policyHash: Hex;
  quoteNonce: bigint;
}

export function quoteDomain(chainId: number, verifyingContract: Hex) {
  return { name: "Nectar", version: "1", chainId, verifyingContract } as const;
}

export function termsFromJson(t: Record<string, string | number>): QuoteTerms {
  return {
    schemaVersion: Number(t.schemaVersion),
    maker: t.maker as Hex,
    makerNonce: BigInt(t.makerNonce),
    marketKey: t.marketKey as Hex,
    adapterVersion: Number(t.adapterVersion),
    borrower: t.borrower as Hex,
    collateralToken: t.collateralToken as Hex,
    collateralAmount: BigInt(t.collateralAmount),
    debtToken: t.debtToken as Hex,
    cashOut: BigInt(t.cashOut),
    maxDebtRepay: BigInt(t.maxDebtRepay),
    collateralRecipient: t.collateralRecipient as Hex,
    keeperCompensation: BigInt(t.keeperCompensation),
    protocolFee: BigInt(t.protocolFee),
    minNetSurplus: BigInt(t.minNetSurplus),
    keeperRecipient: t.keeperRecipient as Hex,
    surplusRecipient: t.surplusRecipient as Hex,
    validUntil: BigInt(t.validUntil),
    policyHash: t.policyHash as Hex,
    quoteNonce: BigInt(t.quoteNonce),
  };
}

export const REFUSALS = [
  "NONE",
  "SCOPE_PAUSED",
  "KEEPER_NOT_ALLOWED",
  "JOB_EXPIRED",
  "QUOTE_NOT_FUNDED",
  "QUOTE_EXPIRED",
  "UNSUPPORTED_MARKET",
  "POLICY_CHANGED",
  "PRICE_UNAVAILABLE",
  "SEQUENCER_UNAVAILABLE",
  "POSITION_CHANGED",
  "DEBT_ABOVE_BOUND",
  "INSUFFICIENT_PROCEEDS",
] as const;
