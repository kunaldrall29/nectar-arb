import {
  decodeEventLog,
  formatUnits,
  type Address,
  type Hex,
  type Log,
} from "viem";
import {
  quoteEscrowAbi,
  nectarExecutorAbi,
  marketRegistryAbi,
  mockErc20Abi,
  mockMorphoAbi,
  mockOracleAbi,
  mockAmmAbi,
} from "@nectar/sdk";
import { deploymentFor, deployments, type Deployment } from "./config";
import { publicClient, probeRpc } from "./clients";

export type Freshness = {
  chainId: number;
  sourceBlock: string;
  observedAt: string;
  status: "current" | "stale" | "unavailable";
};

export type Receipt = {
  chainId: number;
  jobId: string;
  marketKey: string;
  quoteId: string;
  borrower: string;
  debtRepaid: string;
  collateralDelivered: string;
  keeperCompensation: string;
  protocolFee: string;
  surplus: string;
  writeoff: string;
  txHash: string;
  blockNumber: string;
  blockHash: string;
  finality: "L2_included";
  sourceBlock: string;
  freshness: string;
};

export type QuoteView = {
  quoteId: string;
  chainId: number;
  maker: string;
  token: string;
  cashOut: string;
  validUntil: string;
  state: "active" | "filled" | "expired" | "released";
  reservationId: string;
  txHash?: string;
};

export type CashView = {
  chainId: number;
  token: string;
  symbol: string;
  decimals: number;
  wallet?: string;
  deposited: string;
  reserved: string;
  available: string;
  sourceBlock: string;
};

type Cache = {
  at: number;
  block: bigint;
  receipts: Receipt[];
  quotes: QuoteView[];
  deposits: { maker: string; token: string; amount: bigint; chainId: number }[];
};

const cache = new Map<number, Cache>();

function nowIso() {
  return new Date().toISOString();
}

async function pullLogs(d: Deployment): Promise<Cache> {
  if (!d.addresses?.escrow || !d.addresses.executor) {
    return { at: Date.now(), block: 0n, receipts: [], quotes: [], deposits: [] };
  }
  const client = publicClient(d.chainId);
  const block = await client.getBlockNumber();
  const from = d.deploymentBlock ? BigInt(Math.max(0, d.deploymentBlock - 1)) : block > 50_000n ? block - 50_000n : 0n;
  const addresses = [d.addresses.escrow, d.addresses.executor, d.addresses.registry].filter(Boolean) as Address[];
  const logs: Log[] = await client.getLogs({
    address: addresses,
    fromBlock: from,
    toBlock: block,
  });

  const quotes = new Map<string, QuoteView>();
  const receipts: Receipt[] = [];
  const deposits: Cache["deposits"] = [];

  for (const log of logs) {
    try {
      if (log.address.toLowerCase() === d.addresses.escrow.toLowerCase()) {
        const ev = decodeEventLog({ abi: quoteEscrowAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "QuoteReserved") {
          const a = ev.args as unknown as {
            quoteId: Hex;
            maker: Address;
            token: Address;
            cashOut: bigint;
            validUntil: bigint;
            reservationId: Hex;
          };
          quotes.set(a.quoteId, {
            quoteId: a.quoteId,
            chainId: d.chainId,
            maker: a.maker,
            token: a.token,
            cashOut: a.cashOut.toString(),
            validUntil: a.validUntil.toString(),
            state: Number(a.validUntil) <= Date.now() / 1000 ? "expired" : "active",
            reservationId: a.reservationId,
            txHash: log.transactionHash ?? undefined,
          });
        }
        if (ev.eventName === "QuoteConsumed") {
          const a = ev.args as unknown as { quoteId: Hex };
          const q = quotes.get(a.quoteId);
          if (q) q.state = "filled";
        }
        if (ev.eventName === "QuoteReleased") {
          const a = ev.args as unknown as { quoteId: Hex };
          const q = quotes.get(a.quoteId);
          if (q) q.state = "released";
        }
        if (ev.eventName === "CashDeposited") {
          const a = ev.args as unknown as { beneficiary: Address; token: Address; amount: bigint };
          deposits.push({ maker: a.beneficiary, token: a.token, amount: a.amount, chainId: d.chainId });
        }
      }
      if (log.address.toLowerCase() === d.addresses.executor.toLowerCase()) {
        const ev = decodeEventLog({ abi: nectarExecutorAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "LiquidationSettled") {
          const a = ev.args as unknown as {
            jobId: Hex;
            marketKey: Hex;
            quoteId: Hex;
            borrower: Address;
            debtRepaid: bigint;
            collateralDelivered: bigint;
            keeperCompensation: bigint;
            protocolFee: bigint;
            surplus: bigint;
            writeoff: bigint;
          };
          receipts.push({
            chainId: d.chainId,
            jobId: a.jobId,
            marketKey: a.marketKey,
            quoteId: a.quoteId,
            borrower: a.borrower,
            debtRepaid: a.debtRepaid.toString(),
            collateralDelivered: a.collateralDelivered.toString(),
            keeperCompensation: a.keeperCompensation.toString(),
            protocolFee: a.protocolFee.toString(),
            surplus: a.surplus.toString(),
            writeoff: a.writeoff.toString(),
            txHash: log.transactionHash || "",
            blockNumber: (log.blockNumber || 0n).toString(),
            blockHash: log.blockHash || "",
            finality: "L2_included",
            sourceBlock: (log.blockNumber || 0n).toString(),
            freshness: nowIso(),
          });
        }
      }
    } catch {
      // ignore unrelated logs
    }
  }

  return { at: Date.now(), block, receipts, quotes: [...quotes.values()], deposits };
}

export async function sync(chainId: number): Promise<Cache> {
  const hit = cache.get(chainId);
  if (hit && Date.now() - hit.at < 8_000) return hit;
  const d = deploymentFor(chainId);
  if (!d) return { at: Date.now(), block: 0n, receipts: [], quotes: [], deposits: [] };
  const next = await pullLogs(d);
  cache.set(chainId, next);
  return next;
}

export async function networkPayload() {
  const out = [];
  const probed = await Promise.all(deployments().map(async (d) => ({ d, probe: await probeRpc(d) })));
  for (const { d, probe } of probed) {
    const deployed = Boolean(d.addresses?.escrow);
    out.push({
      chainId: d.chainId,
      name:
        d.chainId === 421614
          ? "Arbitrum Sepolia"
          : d.chainId === 46630
            ? "Robinhood Chain Testnet"
            : d.network,
      environment: "public-testnet",
      status: !probe.ok ? "RPC_UNAVAILABLE" : deployed ? "live" : d.status,
      rpcOk: probe.ok,
      sourceBlock: probe.block || null,
      freshness: nowIso(),
      mockLabeled: Boolean(d.mockLabeled),
      keeperAllowlist: Boolean(d.keeperAllowlist),
      explorer: d.explorer || null,
      addresses: d.addresses || null,
      roles: d.roles || null,
      marketKey: d.marketKey || null,
      borrower: d.borrower || null,
      policyHash: d.policyHash || null,
      reason: probe.ok
        ? deployed
          ? null
          : d.status === "awaiting_gas"
            ? "Contracts compiled; deployer awaits testnet ETH"
            : "Monitored — no Nectar deployment on this chain yet"
        : "RPC unreachable",
    });
  }
  return { networks: out, freshness: nowIso() };
}

export async function marketsPayload(chainId?: number) {
  const targets = deployments().filter((d) => !chainId || d.chainId === chainId);
  const markets = await Promise.all(targets.map(async (d) => {
    const probe = await probeRpc(d);
    const freshness: Freshness = {
      chainId: d.chainId,
      sourceBlock: probe.block || "0",
      observedAt: nowIso(),
      status: probe.ok ? "current" : "unavailable",
    };
    if (!d.addresses?.escrow || !probe.ok) {
      return {
        marketKey: d.marketKey || `${d.chainId}:pending`,
        chainId: d.chainId,
        protocol: "Morpho Blue (MOCK)",
        integration: d.addresses?.escrow ? "integrated" : "monitored",
        debtToken: d.addresses?.debtToken || null,
        collateralToken: d.addresses?.collateralToken || null,
        priceStatus: probe.ok ? "unknown" : "RPC_UNAVAILABLE",
        activeQuotes: 0,
        routes: ["maker", "amm-estimate"],
        unservedAmount: null,
        mockLabeled: true,
        freshness,
      };
    }
    const client = publicClient(d.chainId);
    let priceStatus = "valid";
    let symbolDebt = "nmUSDC";
    let symbolCol = "nmSTK";
    let unhealthy = false;
    let borrow = "0";
    try {
      const latest = (await client.readContract({
        address: d.addresses.oracle,
        abi: mockOracleAbi,
        functionName: "latest",
      })) as [bigint, bigint, boolean, Hex];
      if (latest[2] || latest[0] <= 0n) priceStatus = "paused_or_invalid";
      const decDebt = (await client.readContract({
        address: d.addresses.debtToken,
        abi: mockErc20Abi,
        functionName: "symbol",
      })) as string;
      const decCol = (await client.readContract({
        address: d.addresses.collateralToken,
        abi: mockErc20Abi,
        functionName: "symbol",
      })) as string;
      symbolDebt = decDebt;
      symbolCol = decCol;
      if (d.borrower && d.morphoMarketId) {
        unhealthy = (await client.readContract({
          address: d.addresses.morpho,
          abi: mockMorphoAbi,
          functionName: "isUnhealthy",
          args: [d.morphoMarketId, d.borrower],
        })) as boolean;
        const pos = (await client.readContract({
          address: d.addresses.morpho,
          abi: mockMorphoAbi,
          functionName: "positions",
          args: [d.morphoMarketId, d.borrower],
        })) as [bigint, bigint];
        borrow = pos[1].toString();
      }
    } catch {
      priceStatus = "stale";
    }
    const idx = await sync(d.chainId);
    const activeQuotes = idx.quotes.filter((q) => q.state === "active").length;
    let ammEstimate = null;
    try {
      if (d.addresses.amm) {
        ammEstimate = (
          await client.readContract({
            address: d.addresses.amm,
            abi: mockAmmAbi,
            functionName: "estimate",
            args: [d.addresses.collateralToken, 20_000n * 10n ** 18n, d.addresses.debtToken],
          })
        ).toString();
      }
    } catch {
      ammEstimate = null;
    }
    return {
      marketKey: d.marketKey,
      chainId: d.chainId,
      protocol: "Morpho Blue (MOCK)",
      integration: "integrated",
      debtToken: d.addresses.debtToken,
      collateralToken: d.addresses.collateralToken,
      debtSymbol: symbolDebt,
      collateralSymbol: symbolCol,
      priceStatus,
      activeQuotes,
      routes: ["maker", "amm-estimate"],
      unservedAmount: unhealthy ? borrow : "0",
      executableNow: unhealthy && activeQuotes > 0,
      ammEstimate,
      mockLabeled: true,
      borrower: d.borrower || null,
      freshness,
    };
  }));
  return { markets, freshness: nowIso() };
}

export async function liquidityPayload(wallet: Address, chainId?: number) {
  const targets = deployments().filter((d) => !chainId || d.chainId === chainId);
  const accounts: CashView[] = await Promise.all(targets.map(async (d) => {
    const probe = await probeRpc(d);
    if (!d.addresses?.escrow || !probe.ok) {
      return {
        chainId: d.chainId,
        token: d.addresses?.debtToken || "0x0000000000000000000000000000000000000000",
        symbol: d.chainId === 46630 ? "USDG" : "nmUSDC",
        decimals: 6,
        wallet,
        deposited: probe.ok ? "0" : "",
        reserved: probe.ok ? "0" : "",
        available: probe.ok ? "0" : "",
        sourceBlock: probe.block || "unavailable",
      };
    }
    const client = publicClient(d.chainId);
    const [cash, reserved, symbol, decimals, walletBal] = await Promise.all([
      client.readContract({
        address: d.addresses.escrow,
        abi: quoteEscrowAbi,
        functionName: "cashOf",
        args: [wallet, d.addresses.debtToken],
      }) as Promise<bigint>,
      client.readContract({
        address: d.addresses.escrow,
        abi: quoteEscrowAbi,
        functionName: "reservedOf",
        args: [wallet, d.addresses.debtToken],
      }) as Promise<bigint>,
      client.readContract({
        address: d.addresses.debtToken,
        abi: mockErc20Abi,
        functionName: "symbol",
      }) as Promise<string>,
      client.readContract({
        address: d.addresses.debtToken,
        abi: mockErc20Abi,
        functionName: "decimals",
      }) as Promise<number>,
      client.readContract({
        address: d.addresses.debtToken,
        abi: mockErc20Abi,
        functionName: "balanceOf",
        args: [wallet],
      }) as Promise<bigint>,
    ]);
    return {
      chainId: d.chainId,
      token: d.addresses.debtToken,
      symbol,
      decimals,
      wallet,
      deposited: cash.toString(),
      reserved: reserved.toString(),
      available: (cash > reserved ? cash - reserved : 0n).toString(),
      sourceBlock: probe.block || "0",
      ...( { walletToken: walletBal.toString(), display: formatUnits(cash, decimals) } as object),
    } as CashView;
  }));
  return {
    wallet,
    accounts,
    note: "Balances are per chain. Combined dollar figures are never spendable.",
    freshness: nowIso(),
  };
}

export async function receiptsPayload(chainId?: number) {
  const targets = deployments().filter((d) => !chainId || d.chainId === chainId);
  const receipts: Receipt[] = [];
  let sourceBlock = "0";
  for (const d of targets) {
    try {
      const idx = await sync(d.chainId);
      receipts.push(...idx.receipts);
      sourceBlock = idx.block.toString();
    } catch {
      // RPC unavailable — do not fabricate zeros as current
    }
  }
  return { receipts, sourceBlock, freshness: nowIso() };
}

export async function quotesPayload(chainId?: number) {
  const targets = deployments().filter((d) => !chainId || d.chainId === chainId);
  const quotes: QuoteView[] = [];
  for (const d of targets) {
    try {
      const idx = await sync(d.chainId);
      quotes.push(...idx.quotes);
    } catch {
      /* empty */
    }
  }
  return { quotes, freshness: nowIso() };
}

export { marketRegistryAbi };
