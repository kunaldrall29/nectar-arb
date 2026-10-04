import { type Address, type Hex, type PublicClient, zeroAddress } from "viem";
import { makerVaultAbi, marketRegistryAbi, miniMorphoAbi, mockOracleAbi, nectarExecutorAbi, testTokenAbi } from "./abis";
import type { EventCache, StoredLog } from "./events";
import type { Deployment } from "./networks";
import { mulDivUp, oraclePriceToLoanUnits } from "./format";

const WAD = 10n ** 18n;
const SCALE = 10n ** 36n;

export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
}

export type PriceStatus = "valid" | "stale" | "paused" | "invalid";

export interface MarketView {
  marketKey: Hex;
  label: string;
  chainId: number;
  lending: Address;
  lendingMarketId: Hex;
  adapterId: Hex;
  loanToken: TokenInfo;
  collateralToken: TokenInfo;
  oracle: {
    address: Address;
    description: string;
    price: string; // 1e36-scaled raw
    priceLoanUnits: string; // loan base units per whole collateral token
    referenceLoanUnits: string;
    updatedAt: number;
    paused: boolean;
    openStress: boolean;
    status: PriceStatus;
    minPrice: string;
    maxPrice: string;
  };
  lltv: string;
  liquidationIncentive: string; // WAD
  totalSupplyAssets: string;
  totalBorrowAssets: string;
  totalCollateral: string;
  totalBadDebt: string;
  policy: { version: number; maxQuoteLifetime: number; maxPriceAge: number; minProtocolFeeBps: number; maxQuoteCashOut: string };
  paused: { reservations: boolean; executions: boolean };
  activeQuotes: number;
  activeQuoteCash: string;
  liquidatableDebt: string;
  executableDebt: string;
  unservedDebt: string;
  positions: number;
}

export interface PositionView {
  borrower: Address;
  owner?: Address;
  marketKey: Hex;
  label: string;
  collateral: string;
  debt: string;
  healthFactor: string; // WAD, max uint when no debt
  ltv: string; // WAD
  liquidationPriceLoanUnits: string;
  status: "healthy" | "at-risk" | "liquidatable" | "closed";
  coveredByQuote: boolean;
  suggested?: SuggestedQuote;
}

export interface SuggestedQuote {
  collateralAmount: string;
  expectedRepay: string;
  maxDebtRepay: string;
  keeperFee: string;
  protocolFee: string;
  cashOut: string;
  atPriceLoanUnits: string;
}

export type QuoteState = "Active" | "Expired" | "Filled" | "Released";

export interface QuoteView {
  quoteId: Hex;
  maker: Address;
  marketKey: Hex;
  policyVersion: number;
  borrower: Address;
  collateralToken: Address;
  collateralAmount: string;
  debtToken: Address;
  cashOut: string;
  maxDebtRepay: string;
  collateralRecipient: Address;
  keeperFee: string;
  protocolFee: string;
  minNetSurplus: string;
  surplusRecipient: Address;
  validUntil: number;
  nonce: string;
  state: QuoteState;
  registeredBlock: number;
  registeredTx: Hex;
  registeredAt?: number;
}

export interface ReceiptView {
  jobId: Hex;
  quoteId: Hex;
  marketKey: Hex;
  borrower: Address;
  maker: Address;
  keeper: Address;
  debtRepaid: string;
  collateralDelivered: string;
  cashOut: string;
  keeperFee: string;
  protocolFee: string;
  surplus: string;
  writeoff: string;
  policyVersion: number;
  transactionHash: Hex;
  blockNumber: number;
  blockHash: Hex;
  timestamp?: number;
  finality: "L2 included" | "L2 confirmed";
}

const tokenCache = new Map<string, TokenInfo>();
async function token(client: PublicClient, address: Address): Promise<TokenInfo> {
  const k = `${client.chain?.id}:${address}`;
  const hit = tokenCache.get(k);
  if (hit) return hit;
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: testTokenAbi, functionName: "symbol" }),
    client.readContract({ address, abi: testTokenAbi, functionName: "decimals" }),
  ]);
  const t = { address, symbol, decimals };
  tokenCache.set(k, t);
  return t;
}

function lif(lltv: bigint) {
  const f = (WAD * WAD) / (WAD - (3n * 10n ** 17n * (WAD - lltv)) / WAD);
  return f < 115n * 10n ** 16n ? f : 115n * 10n ** 16n;
}

export interface ChainState {
  chainId: number;
  sourceBlock: number;
  observedAt: number;
  blockTime: number;
  markets: MarketView[];
  positions: PositionView[];
  quotes: QuoteView[];
  receipts: ReceiptView[];
  vault: { fundedCash: string; reservedCash: string; cashToken: TokenInfo };
  keeperAllowlistEnabled: boolean;
  treasury: Address;
  guardian: Address;
  globalPause: { reservations: boolean; executions: boolean };
  executor: { jobsSettled: string; totalDebtRepaid: string };
}

/** Reads authoritative contract state plus indexed history into a single consistent view. */
export async function readChainState(client: PublicClient, d: Deployment, cache: EventCache): Promise<ChainState> {
  await cache.sync();
  const blockNumber = BigInt(cache.snapshot.lastBlock);
  const block = await client.getBlock({ blockNumber });
  const now = Number(block.timestamp);
  const at = { blockNumber };

  const keys = (await client.readContract({
    address: d.registry,
    abi: marketRegistryAbi,
    functionName: "allMarketKeys",
    ...at,
  })) as Hex[];

  const [allowlist, treasury, guardian, globalScope, jobsSettled, totalDebtRepaid] = await Promise.all([
    client.readContract({ address: d.registry, abi: marketRegistryAbi, functionName: "keeperAllowlistEnabled", ...at }),
    client.readContract({ address: d.registry, abi: marketRegistryAbi, functionName: "treasury", ...at }),
    client.readContract({ address: d.registry, abi: marketRegistryAbi, functionName: "guardian", ...at }),
    client.readContract({ address: d.registry, abi: marketRegistryAbi, functionName: "GLOBAL_SCOPE", ...at }),
    client.readContract({ address: d.executor, abi: nectarExecutorAbi, functionName: "jobsSettled", ...at }),
    client.readContract({ address: d.executor, abi: nectarExecutorAbi, functionName: "totalDebtRepaid", ...at }),
  ]);
  const gp = await client.readContract({ address: d.registry, abi: marketRegistryAbi, functionName: "pauses", args: [globalScope], ...at });

  // quotes
  const reservedLogs = cache.byName("QuoteReserved");
  const quotes: QuoteView[] = await Promise.all(
    reservedLogs.map(async (l: StoredLog) => {
      const id = l.args.quoteId as Hex;
      const [q, status] = await Promise.all([
        client.readContract({ address: d.vault, abi: makerVaultAbi, functionName: "getQuote", args: [id], ...at }),
        client.readContract({ address: d.vault, abi: makerVaultAbi, functionName: "statusOf", args: [id], ...at }),
      ]);
      const st = Number(status);
      const state: QuoteState =
        st === 2 ? "Filled" : st === 3 ? "Released" : now >= Number(q.validUntil) ? "Expired" : "Active";
      return {
        quoteId: id,
        maker: q.maker,
        marketKey: q.marketKey,
        policyVersion: Number(q.policyVersion),
        borrower: q.borrower,
        collateralToken: q.collateralToken,
        collateralAmount: q.collateralAmount.toString(),
        debtToken: q.debtToken,
        cashOut: q.cashOut.toString(),
        maxDebtRepay: q.maxDebtRepay.toString(),
        collateralRecipient: q.collateralRecipient,
        keeperFee: q.keeperFee.toString(),
        protocolFee: q.protocolFee.toString(),
        minNetSurplus: q.minNetSurplus.toString(),
        surplusRecipient: q.surplusRecipient,
        validUntil: Number(q.validUntil),
        nonce: q.nonce.toString(),
        state,
        registeredBlock: l.blockNumber,
        registeredTx: l.transactionHash,
        registeredAt: cache.timeOf(l),
      };
    }),
  );
  quotes.sort((a, b) => b.registeredBlock - a.registeredBlock);

  // borrowers: demo factory + any Borrow event on the lending market
  const borrowerOwners = new Map<string, Address>();
  for (const l of cache.byName("PositionOpened")) borrowerOwners.set((l.args.borrower as string).toLowerCase(), l.args.owner as Address);
  const borrowerSet = new Map<string, Set<string>>(); // lendingMarketId -> borrowers
  for (const l of cache.byName("Borrow")) {
    const id = (l.args.id as string).toLowerCase();
    if (!borrowerSet.has(id)) borrowerSet.set(id, new Set());
    borrowerSet.get(id)!.add(l.args.onBehalf as string);
  }

  const markets: MarketView[] = [];
  const positions: PositionView[] = [];
  for (const key of keys) {
    const m = await client.readContract({ address: d.registry, abi: marketRegistryAbi, functionName: "getMarket", args: [key], ...at });
    const [loanToken, collateralToken] = await Promise.all([token(client, m.params.loanToken), token(client, m.params.collateralToken)]);
    const o = m.params.oracle;
    const [price, updatedAt, opaused, openStress, refPrice, desc, minP, maxP, mk, pause] = await Promise.all([
      client.readContract({ address: o, abi: mockOracleAbi, functionName: "price", ...at }),
      client.readContract({ address: o, abi: mockOracleAbi, functionName: "updatedAt", ...at }),
      client.readContract({ address: o, abi: mockOracleAbi, functionName: "paused", ...at }),
      client.readContract({ address: o, abi: mockOracleAbi, functionName: "openStress", ...at }),
      client.readContract({ address: o, abi: mockOracleAbi, functionName: "referencePrice", ...at }),
      client.readContract({ address: o, abi: mockOracleAbi, functionName: "description", ...at }),
      client.readContract({ address: o, abi: mockOracleAbi, functionName: "minPrice", ...at }),
      client.readContract({ address: o, abi: mockOracleAbi, functionName: "maxPrice", ...at }),
      client.readContract({ address: m.lending, abi: miniMorphoAbi, functionName: "market", args: [m.lendingMarketId], ...at }),
      client.readContract({ address: d.registry, abi: marketRegistryAbi, functionName: "pauses", args: [key], ...at }),
    ]);
    const status: PriceStatus =
      price === 0n ? "invalid" : opaused ? "paused" : Number(updatedAt) > now || now - Number(updatedAt) > Number(m.policy.maxPriceAge) ? "stale" : "valid";
    const lltv = m.params.lltv;
    const incentive = lif(lltv);

    const mQuotes = quotes.filter((q) => q.marketKey.toLowerCase() === key.toLowerCase());
    const active = mQuotes.filter((q) => q.state === "Active");

    const ids = borrowerSet.get(m.lendingMarketId.toLowerCase()) ?? new Set<string>();
    let liquidatableDebt = 0n;
    let executableDebt = 0n;
    let count = 0;
    for (const b of ids) {
      const borrower = b as Address;
      const [, debt, collateral] = await client.readContract({
        address: m.lending,
        abi: miniMorphoAbi,
        functionName: "position",
        args: [m.lendingMarketId, borrower],
        ...at,
      });
      if (debt === 0n && collateral === 0n) continue;
      count++;
      const collValue = (collateral * price) / SCALE; // loan units
      const maxBorrow = (collValue * lltv) / WAD;
      const hf = debt === 0n ? 2n ** 256n - 1n : (maxBorrow * WAD) / debt;
      const ltv = collValue === 0n ? 0n : (debt * WAD) / collValue;
      const liqPrice = collateral === 0n || debt === 0n ? 0n : (debt * WAD * 10n ** BigInt(collateralToken.decimals)) / ((collateral * lltv));
      const st: PositionView["status"] =
        debt === 0n ? "closed" : hf < WAD ? "liquidatable" : hf < (110n * WAD) / 100n ? "at-risk" : "healthy";
      const covering = active.filter((q) => q.borrower === zeroAddress || q.borrower.toLowerCase() === b.toLowerCase());
      if (st === "liquidatable") {
        liquidatableDebt += debt;
        if (covering.length && status === "valid" && !pause[1] && !gp[1]) {
          // repay feasible through the best covering quote at the current price
          const best = covering
            .map((q) => {
              const r = mulDivUp(mulDivUp(BigInt(q.collateralAmount), price, SCALE), WAD, incentive);
              return r <= BigInt(q.maxDebtRepay) && BigInt(q.collateralAmount) <= collateral && r <= debt ? r : 0n;
            })
            .reduce((a, c) => (c > a ? c : a), 0n);
          executableDebt += best;
        }
      }
      positions.push({
        borrower,
        owner: borrowerOwners.get(b.toLowerCase()),
        marketKey: key,
        label: m.label,
        collateral: collateral.toString(),
        debt: debt.toString(),
        healthFactor: hf.toString(),
        ltv: ltv.toString(),
        liquidationPriceLoanUnits: liqPrice.toString(),
        status: st,
        coveredByQuote: covering.length > 0,
        suggested: debt > 0n ? suggest(collateral, debt, price, incentive, collateralToken.decimals, m.policy.minProtocolFeeBps) : undefined,
      });
    }

    markets.push({
      marketKey: key,
      label: m.label,
      chainId: d.chainId,
      lending: m.lending,
      lendingMarketId: m.lendingMarketId,
      adapterId: m.adapterId,
      loanToken,
      collateralToken,
      oracle: {
        address: o,
        description: desc,
        price: price.toString(),
        priceLoanUnits: oraclePriceToLoanUnits(price, collateralToken.decimals).toString(),
        referenceLoanUnits: oraclePriceToLoanUnits(refPrice, collateralToken.decimals).toString(),
        updatedAt: Number(updatedAt),
        paused: opaused,
        openStress,
        status,
        minPrice: minP.toString(),
        maxPrice: maxP.toString(),
      },
      lltv: lltv.toString(),
      liquidationIncentive: incentive.toString(),
      totalSupplyAssets: mk[0].toString(),
      totalBorrowAssets: mk[1].toString(),
      totalCollateral: mk[2].toString(),
      totalBadDebt: mk[3].toString(),
      policy: {
        version: Number(m.policy.version),
        maxQuoteLifetime: Number(m.policy.maxQuoteLifetime),
        maxPriceAge: Number(m.policy.maxPriceAge),
        minProtocolFeeBps: Number(m.policy.minProtocolFeeBps),
        maxQuoteCashOut: m.policy.maxQuoteCashOut.toString(),
      },
      paused: { reservations: pause[0] || gp[0], executions: pause[1] || gp[1] },
      activeQuotes: active.length,
      activeQuoteCash: active.reduce((a, q) => a + BigInt(q.cashOut), 0n).toString(),
      liquidatableDebt: liquidatableDebt.toString(),
      executableDebt: executableDebt.toString(),
      unservedDebt: (liquidatableDebt - executableDebt).toString(),
      positions: count,
    });
  }

  const cashToken = await token(client, d.usdc);
  const fundedCash = await client.readContract({ address: d.vault, abi: makerVaultAbi, functionName: "totalLiabilities", args: [d.usdc], ...at });
  const reservedCash = quotes
    .filter((q) => q.state === "Active" || q.state === "Expired")
    .reduce((a, q) => a + BigInt(q.cashOut), 0n);

  const receipts: ReceiptView[] = cache
    .byName("LiquidationSettled")
    .map((l) => ({
      jobId: l.args.jobId as Hex,
      quoteId: l.args.quoteId as Hex,
      marketKey: l.args.marketKey as Hex,
      borrower: l.args.borrower as Address,
      maker: l.args.maker as Address,
      keeper: l.args.keeper as Address,
      debtRepaid: l.args.debtRepaid as string,
      collateralDelivered: l.args.collateralDelivered as string,
      cashOut: l.args.cashOut as string,
      keeperFee: l.args.keeperFee as string,
      protocolFee: l.args.protocolFee as string,
      surplus: l.args.surplus as string,
      writeoff: l.args.writeoff as string,
      policyVersion: Number(l.args.policyVersion),
      transactionHash: l.transactionHash,
      blockNumber: l.blockNumber,
      blockHash: l.blockHash,
      timestamp: cache.timeOf(l),
      finality: (cache.snapshot.lastBlock - l.blockNumber >= 20 ? "L2 confirmed" : "L2 included") as ReceiptView["finality"],
    }))
    .reverse();

  return {
    chainId: d.chainId,
    sourceBlock: Number(blockNumber),
    observedAt: Date.now(),
    blockTime: now,
    markets,
    positions: positions.sort((a, b) => (BigInt(a.healthFactor) < BigInt(b.healthFactor) ? -1 : 1)),
    quotes,
    receipts,
    vault: { fundedCash: fundedCash.toString(), reservedCash: reservedCash.toString(), cashToken },
    keeperAllowlistEnabled: allowlist,
    treasury,
    guardian,
    globalPause: { reservations: gp[0], executions: gp[1] },
    executor: { jobsSettled: jobsSettled.toString(), totalDebtRepaid: totalDebtRepaid.toString() },
  };
}

/**
 * Suggest an exact single-fill quote that covers most of the debt at the current price.
 * The seized amount stays below the debt-equivalent so repayment never exceeds outstanding debt,
 * and the bound gets a 2% buffer. Lower prices only reduce the required repayment for a fixed seizure.
 */
export function suggest(
  collateral: bigint,
  debt: bigint,
  price: bigint,
  incentive: bigint,
  collDecimals: number,
  minProtocolFeeBps: number,
): SuggestedQuote {
  // collateral needed to repay the full debt at this price: debt * LIF / price
  const full = (debt * incentive * SCALE) / WAD / price;
  let seize = (full * 95n) / 100n;
  if (seize > collateral) seize = collateral;
  const round = 10n ** BigInt(Math.max(0, collDecimals - 4));
  seize = (seize / round) * round;
  const expectedRepay = mulDivUp(mulDivUp(seize, price, SCALE), WAD, incentive);
  const maxDebtRepay = (expectedRepay * 102n) / 100n;
  const keeperFee = (expectedRepay * 30n) / 10_000n; // 0.30%
  const bps = BigInt(Math.max(minProtocolFeeBps, 10));
  const protocolFee = mulDivUp(maxDebtRepay + keeperFee, bps, 10_000n - bps);
  const cashOut = maxDebtRepay + keeperFee + protocolFee;
  return {
    collateralAmount: seize.toString(),
    expectedRepay: expectedRepay.toString(),
    maxDebtRepay: maxDebtRepay.toString(),
    keeperFee: keeperFee.toString(),
    protocolFee: protocolFee.toString(),
    cashOut: cashOut.toString(),
    atPriceLoanUnits: oraclePriceToLoanUnits(price, collDecimals).toString(),
  };
}

export async function readLiquidity(client: PublicClient, d: Deployment, wallet: Address) {
  const t = await token(client, d.usdc);
  const [walletBal, cash, reserved, avail] = await Promise.all([
    client.readContract({ address: d.usdc, abi: testTokenAbi, functionName: "balanceOf", args: [wallet] }),
    client.readContract({ address: d.vault, abi: makerVaultAbi, functionName: "cashOf", args: [wallet, d.usdc] }),
    client.readContract({ address: d.vault, abi: makerVaultAbi, functionName: "reservedOf", args: [wallet, d.usdc] }),
    client.readContract({ address: d.vault, abi: makerVaultAbi, functionName: "available", args: [wallet, d.usdc] }),
  ]);
  return {
    chainId: d.chainId,
    wallet,
    accounts: [
      {
        token: t,
        escrow: d.vault,
        walletBalance: walletBal.toString(),
        cash: cash.toString(),
        reserved: reserved.toString(),
        available: avail.toString(),
      },
    ],
  };
}
