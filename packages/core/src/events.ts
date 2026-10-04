import { parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import {
  demoPositionFactoryAbi,
  makerVaultAbi,
  marketRegistryAbi,
  miniMorphoAbi,
  mockOracleAbi,
  nectarExecutorAbi,
} from "./abis";
import type { Deployment } from "./networks";

export const nectarEventsAbi = [
  ...makerVaultAbi.filter((x) => x.type === "event"),
  ...nectarExecutorAbi.filter((x) => x.type === "event"),
  ...marketRegistryAbi.filter((x) => x.type === "event"),
  ...miniMorphoAbi.filter((x) => x.type === "event"),
  ...demoPositionFactoryAbi.filter((x) => x.type === "event"),
  ...mockOracleAbi.filter((x) => x.type === "event" && x.name === "PriceUpdated"),
] as const;

/** JSON-safe decoded log. Bigints are stored as decimal strings. */
export interface StoredLog {
  key: string; // chainId:txHash:logIndex (stable event identity, PRD Section 14)
  eventName: string;
  address: Address;
  args: Record<string, string | boolean>;
  blockNumber: number;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
}

export interface EventCacheSnapshot {
  chainId: number;
  lastBlock: number;
  logs: StoredLog[];
  blockTimes: Record<string, number>;
}

export interface EventCacheOptions {
  chunk?: bigint;
  /** Blocks re-scanned on every sync so that reorged logs are replaced by canonical ones. */
  reorgWindow?: number;
  load?: () => EventCacheSnapshot | undefined;
  save?: (s: EventCacheSnapshot) => void;
}

function toJson(args: Record<string, unknown>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    out[k] = typeof v === "bigint" ? v.toString() : typeof v === "boolean" ? v : String(v);
  }
  return out;
}

export function deploymentAddresses(d: Deployment): Address[] {
  return [
    d.vault,
    d.executor,
    d.registry,
    d.morpho,
    d.positionFactory,
    d.oracleTsla,
    d.oracleAapl,
    d.oracleNvda,
  ];
}

/**
 * Incremental, idempotent log indexer. Replaying the same stream yields the same state (RC02):
 * logs are keyed by chainId:txHash:logIndex and the trailing `reorgWindow` blocks are re-fetched
 * and replaced on every sync so logs from orphaned blocks disappear.
 */
export class EventCache {
  snapshot: EventCacheSnapshot;
  private syncing?: Promise<void>;
  lastSyncAt = 0;
  lastError?: string;

  constructor(
    private client: PublicClient,
    private d: Deployment,
    private opts: EventCacheOptions = {},
  ) {
    const loaded = opts.load?.();
    this.snapshot =
      loaded && loaded.chainId === d.chainId && loaded.lastBlock >= d.startBlock - 1
        ? loaded
        : { chainId: d.chainId, lastBlock: d.startBlock - 1, logs: [], blockTimes: {} };
  }

  sync(): Promise<void> {
    if (!this.syncing) {
      this.syncing = this.doSync().finally(() => {
        this.syncing = undefined;
      });
    }
    return this.syncing;
  }

  private async doSync() {
    try {
      const head = Number(await this.client.getBlockNumber());
      const window = this.opts.reorgWindow ?? 12;
      const from = Math.max(this.d.startBlock, Math.min(this.snapshot.lastBlock + 1, head - window));
      if (from > head) return;
      const chunk = Number(this.opts.chunk ?? 50_000n);
      const fresh: StoredLog[] = [];
      for (let start = from; start <= head; start += chunk) {
        const end = Math.min(head, start + chunk - 1);
        const raw = await this.client.getLogs({
          address: deploymentAddresses(this.d),
          fromBlock: BigInt(start),
          toBlock: BigInt(end),
        });
        const parsed = parseEventLogs({ abi: nectarEventsAbi, logs: raw, strict: false });
        for (const l of parsed) {
          if (!l.eventName || l.blockNumber == null || l.transactionHash == null) continue;
          fresh.push({
            key: `${this.d.chainId}:${l.transactionHash}:${l.logIndex}`,
            eventName: l.eventName,
            address: l.address,
            args: toJson(l.args as Record<string, unknown>),
            blockNumber: Number(l.blockNumber),
            blockHash: l.blockHash!,
            transactionHash: l.transactionHash,
            logIndex: Number(l.logIndex),
          });
        }
      }
      const kept = this.snapshot.logs.filter((l) => l.blockNumber < from);
      const seen = new Set(kept.map((l) => l.key));
      for (const l of fresh) if (!seen.has(l.key)) (kept.push(l), seen.add(l.key));
      kept.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
      this.snapshot.logs = kept;
      this.snapshot.lastBlock = head;
      await this.fillBlockTimes();
      this.lastSyncAt = Date.now();
      this.lastError = undefined;
      this.opts.save?.(this.snapshot);
    } catch (e) {
      this.lastError = (e as Error).message?.slice(0, 300);
      throw e;
    }
  }

  private async fillBlockTimes() {
    const want = new Set(
      this.snapshot.logs
        .filter((l) =>
          ["LiquidationSettled", "QuoteReserved", "CashDeposited", "CashWithdrawn", "QuoteReleased", "PositionOpened", "PriceUpdated"].includes(
            l.eventName,
          ),
        )
        .map((l) => String(l.blockNumber)),
    );
    const missing = [...want].filter((b) => this.snapshot.blockTimes[b] == null).slice(-200);
    await Promise.all(
      missing.map(async (b) => {
        const blk = await this.client.getBlock({ blockNumber: BigInt(b) });
        this.snapshot.blockTimes[b] = Number(blk.timestamp);
      }),
    );
  }

  byName(name: string): StoredLog[] {
    return this.snapshot.logs.filter((l) => l.eventName === name);
  }

  timeOf(l: StoredLog): number | undefined {
    return this.snapshot.blockTimes[String(l.blockNumber)];
  }
}
