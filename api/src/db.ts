import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type JobRow = {
  id: string;
  kind: string;
  status: string;
  tx_hash: string | null;
  reason: string | null;
  detail: string;
  created_at: number;
  updated_at: number;
};

export function openDb(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS logs (
      chain_id INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      block_number INTEGER NOT NULL,
      address TEXT NOT NULL,
      event_name TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (chain_id, tx_hash, log_index)
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      tx_hash TEXT,
      reason TEXT,
      detail TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

export type DB = ReturnType<typeof openDb>;

export function metaGet(db: DB, key: string): string | null {
  const row = db.prepare("SELECT v FROM meta WHERE k = ?").get(key) as { v: string } | undefined;
  return row?.v ?? null;
}

export function metaSet(db: DB, key: string, value: string) {
  db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(key, value);
}

export function insertLog(
  db: DB,
  row: {
    chainId: number;
    txHash: string;
    logIndex: number;
    blockNumber: number;
    address: string;
    eventName: string;
    data: string;
  },
) {
  db.prepare(
    `INSERT OR IGNORE INTO logs (chain_id, tx_hash, log_index, block_number, address, event_name, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.chainId, row.txHash, row.logIndex, row.blockNumber, row.address, row.eventName, row.data);
}

export function listLogs(db: DB, chainId: number, eventName?: string) {
  if (eventName) {
    return db
      .prepare("SELECT * FROM logs WHERE chain_id = ? AND event_name = ? ORDER BY block_number, log_index")
      .all(chainId, eventName) as Array<Record<string, unknown>>;
  }
  return db
    .prepare("SELECT * FROM logs WHERE chain_id = ? ORDER BY block_number, log_index")
    .all(chainId) as Array<Record<string, unknown>>;
}

export function clearLogs(db: DB, chainId: number) {
  db.prepare("DELETE FROM logs WHERE chain_id = ?").run(chainId);
}

export function clearJobs(db: DB) {
  db.exec("DELETE FROM jobs");
}

export function createJob(db: DB, kind: string, detail: unknown): JobRow {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO jobs (id, kind, status, tx_hash, reason, detail, created_at, updated_at)
     VALUES (?, ?, 'awaiting_signature', NULL, NULL, ?, ?, ?)`,
  ).run(id, kind, JSON.stringify(detail), now, now);
  return getJob(db, id)!;
}

export function getJob(db: DB, id: string): JobRow | null {
  return (db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined) ?? null;
}

export function listJobs(db: DB): JobRow[] {
  return db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as unknown as JobRow[];
}

export function updateJob(
  db: DB,
  id: string,
  patch: Partial<Pick<JobRow, "status" | "tx_hash" | "reason" | "detail">>,
) {
  const current = getJob(db, id);
  if (!current) return null;
  const status = patch.status ?? current.status;
  const tx = patch.tx_hash === undefined ? current.tx_hash : patch.tx_hash;
  const reason = patch.reason === undefined ? current.reason : patch.reason;
  const detail = patch.detail ?? current.detail;
  db.prepare("UPDATE jobs SET status = ?, tx_hash = ?, reason = ?, detail = ?, updated_at = ? WHERE id = ?").run(
    status,
    tx,
    reason,
    detail,
    Date.now(),
    id,
  );
  return getJob(db, id);
}

export function publicJob(row: JobRow) {
  let detail: unknown = {};
  try {
    detail = JSON.parse(row.detail);
  } catch {
    detail = {};
  }
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    txHash: row.tx_hash,
    reason: row.reason,
    detail,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
