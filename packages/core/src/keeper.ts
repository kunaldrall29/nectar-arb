import {
  BaseError,
  ContractFunctionRevertedError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  zeroAddress,
} from "viem";
import { makerVaultAbi, mockOracleAbi, nectarExecutorAbi } from "./abis";
import type { EventCache } from "./events";
import type { Deployment } from "./networks";
import { readChainState, type ChainState } from "./reader";
import { REFUSAL_CODES, REFUSAL_TEXT, type RefusalCode } from "./refusals";

export type JobState = "Observed" | "Simulated" | "Submitted" | "Included" | "Rejected" | "Reverted";

export interface KeeperDecision {
  at: number;
  chainId: number;
  borrower: Address;
  marketKey: Hex;
  label: string;
  quoteId?: Hex;
  state: JobState;
  code: RefusalCode;
  reason: string;
  expectedRepay?: string;
  keeperFee?: string;
  txHash?: Hex;
  blockNumber?: number;
  candidatesConsidered: number;
}

export interface KeeperTickResult {
  sourceBlock: number;
  keeper: Address;
  decisions: KeeperDecision[];
  released: Hex[];
  poked: Address[];
  state: ChainState;
}

export interface KeeperOptions {
  releaseExpired?: boolean;
  pokeStaleOraclesAfter?: number; // seconds
  dryRun?: boolean;
  log?: (msg: string) => void;
  onSubmitted?: (d: KeeperDecision) => void;
}

function decodeRevert(e: unknown): { code: RefusalCode; detail: string } {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (r?.data?.errorName === "JobRefused") {
      const idx = Number(r.data.args?.[0] ?? 0);
      return { code: REFUSAL_CODES[idx] ?? "SIMULATION_REVERTED", detail: "JobRefused" };
    }
    if (r?.data?.errorName === "DebtExceedsBound") return { code: "DEBT_EXCEEDS_BOUND", detail: "DebtExceedsBound" };
    if (r?.data?.errorName === "InsufficientProceeds") return { code: "INSUFFICIENT_PROCEEDS", detail: "InsufficientProceeds" };
    return { code: "SIMULATION_REVERTED", detail: r?.data?.errorName ?? e.shortMessage };
  }
  return { code: "SIMULATION_REVERTED", detail: (e as Error)?.message ?? String(e) };
}

/**
 * One keeper pass (PRD "Keeper execution" journey):
 * detect liquidatable positions → evaluate every covering funded quote with previewJob →
 * pick the best eligible route → full eth_call simulation → submit → reconcile the receipt.
 * Every refusal is explained with a PRD failure code.
 */
export async function keeperTick(
  publicClient: PublicClient,
  wallet: WalletClient<Transport, Chain, Account>,
  d: Deployment,
  cache: EventCache,
  opts: KeeperOptions = {},
): Promise<KeeperTickResult> {
  const log = opts.log ?? (() => {});
  const keeper = wallet.account.address;
  const state = await readChainState(publicClient, d, cache);
  const decisions: KeeperDecision[] = [];
  const released: Hex[] = [];
  const poked: Address[] = [];
  const now = state.blockTime;

  for (const pos of state.positions.filter((p) => p.status === "liquidatable")) {
    const market = state.markets.find((m) => m.marketKey === pos.marketKey)!;
    const base = { at: Date.now(), chainId: d.chainId, borrower: pos.borrower, marketKey: pos.marketKey, label: pos.label };
    const covering = state.quotes.filter(
      (q) =>
        q.state === "Active" &&
        q.marketKey === pos.marketKey &&
        (q.borrower === zeroAddress || q.borrower.toLowerCase() === pos.borrower.toLowerCase()),
    );
    if (covering.length === 0) {
      decisions.push({ ...base, state: "Rejected", code: "NO_FUNDED_QUOTE", reason: REFUSAL_TEXT.NO_FUNDED_QUOTE, candidatesConsidered: 0 });
      log(`[skip] ${pos.label} ${pos.borrower}: no funded quote (unserved debt ${pos.debt})`);
      continue;
    }

    const deadline = BigInt(now + 120);
    const previews = await Promise.all(
      covering.map(async (q) => {
        const job = { quoteId: q.quoteId, borrower: pos.borrower, deadline };
        const [code, repay, surplus] = await publicClient.readContract({
          address: d.executor,
          abi: nectarExecutorAbi,
          functionName: "previewJob",
          args: [job, keeper],
        });
        return { q, job, code: REFUSAL_CODES[Number(code)] as RefusalCode, repay, surplus };
      }),
    );
    const eligible = previews
      .filter((p) => p.code === "OK")
      .sort((a, b) => {
        const kf = BigInt(b.q.keeperFee) - BigInt(a.q.keeperFee);
        if (kf !== 0n) return kf > 0n ? 1 : -1;
        return b.surplus > a.surplus ? 1 : -1;
      });

    if (eligible.length === 0) {
      const first = previews[0];
      decisions.push({
        ...base,
        quoteId: first.q.quoteId,
        state: "Rejected",
        code: first.code,
        reason: REFUSAL_TEXT[first.code],
        candidatesConsidered: previews.length,
      });
      log(`[refuse] ${pos.label} ${pos.borrower}: ${first.code} — ${REFUSAL_TEXT[first.code]}`);
      continue;
    }

    const best = eligible[0];
    try {
      const sim = await publicClient.simulateContract({
        address: d.executor,
        abi: nectarExecutorAbi,
        functionName: "executeJob",
        args: [best.job],
        account: wallet.account,
      });
      log(`[simulated] ${pos.label} ${pos.borrower} via quote ${best.q.quoteId.slice(0, 10)} repay=${sim.result.debtRepaid}`);
      if (opts.dryRun) {
        decisions.push({ ...base, quoteId: best.q.quoteId, state: "Simulated", code: "OK", reason: "Dry run: simulation passed.", expectedRepay: best.repay.toString(), keeperFee: best.q.keeperFee, candidatesConsidered: previews.length });
        continue;
      }
      const hash = await wallet.writeContract(sim.request);
      log(`[submitted] ${hash}`);
      opts.onSubmitted?.({ ...base, quoteId: best.q.quoteId, state: "Submitted", code: "OK", reason: "Broadcast; awaiting inclusion.", txHash: hash, candidatesConsidered: previews.length });
      const rcpt = await publicClient.waitForTransactionReceipt({ hash });
      if (rcpt.status === "success") {
        decisions.push({
          ...base,
          quoteId: best.q.quoteId,
          state: "Included",
          code: "OK",
          reason: `Settled atomically: repaid debt with maker cash, delivered collateral to the maker, paid fees.`,
          expectedRepay: best.repay.toString(),
          keeperFee: best.q.keeperFee,
          txHash: hash,
          blockNumber: Number(rcpt.blockNumber),
          candidatesConsidered: previews.length,
        });
        log(`[included] block ${rcpt.blockNumber} ${hash}`);
      } else {
        decisions.push({ ...base, quoteId: best.q.quoteId, state: "Reverted", code: "SIMULATION_REVERTED", reason: "Included but reverted (state changed after simulation). Gas cost borne by the keeper.", txHash: hash, candidatesConsidered: previews.length });
      }
    } catch (e) {
      const { code, detail } = decodeRevert(e);
      decisions.push({ ...base, quoteId: best.q.quoteId, state: "Rejected", code, reason: `${REFUSAL_TEXT[code]} (${detail})`, candidatesConsidered: previews.length });
      log(`[refuse] simulation: ${code} ${detail}`);
    }
  }

  if (opts.releaseExpired && !opts.dryRun) {
    for (const q of state.quotes.filter((x) => x.state === "Expired")) {
      try {
        const hash = await wallet.writeContract({ address: d.vault, abi: makerVaultAbi, functionName: "releaseExpired", args: [q.quoteId] });
        await publicClient.waitForTransactionReceipt({ hash });
        released.push(q.quoteId);
        log(`[release] expired quote ${q.quoteId.slice(0, 10)} returned to maker ${q.maker}`);
      } catch (e) {
        log(`[release] failed ${(e as Error).message?.slice(0, 120)}`);
      }
    }
  }

  if (opts.pokeStaleOraclesAfter && !opts.dryRun) {
    for (const m of state.markets) {
      if (m.oracle.openStress && now - m.oracle.updatedAt > opts.pokeStaleOraclesAfter) {
        const hash = await wallet.writeContract({ address: m.oracle.address, abi: mockOracleAbi, functionName: "poke" });
        await publicClient.waitForTransactionReceipt({ hash });
        poked.push(m.oracle.address);
        log(`[heartbeat] refreshed mock oracle ${m.label}`);
      }
    }
  }

  return { sourceBlock: state.sourceBlock, keeper, decisions, released, poked, state };
}
