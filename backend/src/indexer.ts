import { decodeEventLog, type Abi, type Hex, type Log } from "viem";
import {
  makerEscrowAbi,
  quoteRegistryAbi,
  marketRegistryAbi,
  nectarExecutorAbi,
  pauseGuardAbi,
  mockLendingMarketAbi,
  mockOracleAbi,
} from "./generated/abis.js";
import type { NetworkConfig } from "./config.js";
import { net } from "./chain.js";
import { db, json, transitionJob } from "./db.js";
import { log } from "./log.js";

const MAX_RANGE = BigInt(process.env.INDEX_MAX_RANGE ?? 2000);
const REORG_DEPTH = 32;

function abiFor(name: string): Abi {
  switch (name) {
    case "MakerEscrow":
      return makerEscrowAbi as Abi;
    case "QuoteRegistry":
      return quoteRegistryAbi as Abi;
    case "MarketRegistry":
      return marketRegistryAbi as Abi;
    case "NectarExecutor":
      return nectarExecutorAbi as Abi;
    case "PauseGuard":
      return pauseGuardAbi as Abi;
    case "MockLendingMarket":
      return mockLendingMarketAbi as Abi;
    default:
      return mockOracleAbi as Abi;
  }
}

const INDEXED = ["MakerEscrow", "QuoteRegistry", "MarketRegistry", "NectarExecutor", "PauseGuard", "MockLendingMarket", "mTSLAOracle", "mNVDAOracle"];

export interface IndexerStatus {
  lastIndexed: number;
  head: number;
  lastError?: string;
  lastOkAt?: number;
}
export const indexerStatus = new Map<string, IndexerStatus>();

const insertEvent = db.prepare(`INSERT OR IGNORE INTO events
  (id, network, chain_id, contract, event_name, block_number, block_hash, block_time, tx_hash, log_index, args)
  VALUES (@id, @network, @chain_id, @contract, @event_name, @block_number, @block_hash, @block_time, @tx_hash, @log_index, @args)`);

export async function indexOnce(cfg: NetworkConfig): Promise<void> {
  const { client } = net(cfg);
  const st = indexerStatus.get(cfg.key) ?? { lastIndexed: cfg.manifest.deploymentBlock - 1, head: 0 };
  indexerStatus.set(cfg.key, st);
  try {
    const head = await client.getBlockNumber();
    st.head = Number(head);
    await checkReorg(cfg);
    const cur = db.prepare("SELECT last_block FROM cursors WHERE network = ?").get(cfg.key) as { last_block: number } | undefined;
    let from = BigInt((cur?.last_block ?? cfg.manifest.deploymentBlock - 1) + 1);
    if (from > head) {
      st.lastIndexed = Number(head);
      st.lastOkAt = Date.now();
      st.lastError = undefined;
      return;
    }
    const addrToName = new Map<string, string>();
    for (const n of INDEXED) {
      const a = cfg.manifest.contracts[n];
      if (a) addrToName.set(a.toLowerCase(), n);
    }
    while (from <= head) {
      const to = from + MAX_RANGE - 1n > head ? head : from + MAX_RANGE - 1n;
      const logs = await client.getLogs({ address: [...addrToName.keys()] as Hex[], fromBlock: from, toBlock: to });
      const blockTimes = new Map<bigint, number>();
      for (const l of logs) {
        if (l.blockNumber != null && !blockTimes.has(l.blockNumber)) {
          const b = await client.getBlock({ blockNumber: l.blockNumber });
          blockTimes.set(l.blockNumber, Number(b.timestamp));
          db.prepare("INSERT OR REPLACE INTO blocks (network, number, hash) VALUES (?, ?, ?)").run(cfg.key, Number(l.blockNumber), b.hash);
        }
      }
      const tx = db.transaction((ls: Log[]) => {
        for (const l of ls) {
          const name = addrToName.get(l.address.toLowerCase());
          if (!name) continue;
          let decoded;
          try {
            decoded = decodeEventLog({ abi: abiFor(name), data: l.data, topics: l.topics });
          } catch {
            continue;
          }
          insertEvent.run({
            id: `${cfg.key}:${l.address.toLowerCase()}:${l.transactionHash}:${l.logIndex}`,
            network: cfg.key,
            chain_id: cfg.chainId,
            contract: name,
            event_name: decoded.eventName,
            block_number: Number(l.blockNumber),
            block_hash: l.blockHash,
            block_time: blockTimes.get(l.blockNumber!) ?? null,
            tx_hash: l.transactionHash,
            log_index: l.logIndex,
            args: json(decoded.args),
          });
        }
        const headBlockHash = null;
        void headBlockHash;
        db.prepare("INSERT INTO cursors (network, last_block) VALUES (?, ?) ON CONFLICT(network) DO UPDATE SET last_block = excluded.last_block").run(cfg.key, Number(to));
      });
      tx(logs);
      from = to + 1n;
    }
    const hb = await client.getBlock({ blockNumber: head });
    db.prepare("INSERT OR REPLACE INTO blocks (network, number, hash) VALUES (?, ?, ?)").run(cfg.key, Number(head), hb.hash);
    db.prepare("DELETE FROM blocks WHERE network = ? AND number < ?").run(cfg.key, Number(head) - 5000);
    st.lastIndexed = Number(head);
    st.lastOkAt = Date.now();
    st.lastError = undefined;
  } catch (e) {
    st.lastError = (e as Error).message.split("\n")[0];
    log.warn(`[indexer:${cfg.key}] ${st.lastError}`);
  }
}

/** RC02: compare stored canonical hashes for recent blocks; on mismatch, drop indexed effects and re-index. */
async function checkReorg(cfg: NetworkConfig) {
  const { client } = net(cfg);
  const rows = db
    .prepare("SELECT number, hash FROM blocks WHERE network = ? ORDER BY number DESC LIMIT ?")
    .all(cfg.key, REORG_DEPTH) as { number: number; hash: string }[];
  let forkPoint: number | null = null;
  for (const r of rows) {
    const b = await client.getBlock({ blockNumber: BigInt(r.number) }).catch(() => null);
    if (!b || b.hash !== r.hash) forkPoint = r.number;
    else break;
  }
  if (forkPoint == null) return;
  log.warn(`[indexer:${cfg.key}] reorg detected at block ${forkPoint}; rolling back`);
  db.transaction(() => {
    const removed = db
      .prepare("SELECT DISTINCT tx_hash FROM events WHERE network = ? AND block_number >= ?")
      .all(cfg.key, forkPoint) as { tx_hash: string }[];
    for (const r of removed) {
      const job = db.prepare("SELECT job_id FROM jobs WHERE tx_hash = ? AND state IN ('Included','Finalized')").get(r.tx_hash) as { job_id: string } | undefined;
      if (job) transitionJob(job.job_id, "Reorged", { reason: `block ${forkPoint} left canonical chain` });
    }
    db.prepare("DELETE FROM events WHERE network = ? AND block_number >= ?").run(cfg.key, forkPoint);
    db.prepare("DELETE FROM blocks WHERE network = ? AND number >= ?").run(cfg.key, forkPoint);
    db.prepare("UPDATE cursors SET last_block = ? WHERE network = ?").run(forkPoint - 1, cfg.key);
  })();
}

export interface EventRow {
  id: string;
  network: string;
  chain_id: number;
  contract: string;
  event_name: string;
  block_number: number;
  block_hash: string;
  block_time: number | null;
  tx_hash: string;
  log_index: number;
  args: string;
}

export function eventsByName(network: string | null, names: string[]): (EventRow & { a: Record<string, any> })[] {
  const placeholders = names.map(() => "?").join(",");
  const rows = (
    network
      ? db.prepare(`SELECT * FROM events WHERE network = ? AND event_name IN (${placeholders}) ORDER BY block_number, log_index`).all(network, ...names)
      : db.prepare(`SELECT * FROM events WHERE event_name IN (${placeholders}) ORDER BY block_number, log_index`).all(...names)
  ) as EventRow[];
  return rows.map((r) => ({ ...r, a: JSON.parse(r.args) }));
}
