import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
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
  `);
  return db;
}

export function metaGet(db, key) {
  const row = db.prepare("SELECT v FROM meta WHERE k = ?").get(key);
  return row?.v ?? null;
}

export function metaSet(db, key, value) {
  db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(key, value);
}

export function recordJob(db, row) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO jobs (id, kind, status, tx_hash, reason, detail, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, tx_hash = excluded.tx_hash, reason = excluded.reason, detail = excluded.detail, updated_at = excluded.updated_at`,
  ).run(row.id, row.kind, row.status, row.txHash ?? null, row.reason ?? null, JSON.stringify(row.detail ?? {}), now, now);
}

/**
 * Send a contract call once. If a hash is already stored for `key`, wait for that transaction
 * instead of submitting another one.
 */
export async function submitOrRecover({ publicClient, walletClient, request, db, key }) {
  const existing = metaGet(db, key);
  if (existing) {
    const tx = await publicClient.getTransaction({ hash: existing }).catch(() => null);
    if (tx) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: existing });
      return { hash: existing, receipt, recovered: true };
    }
  }
  const hash = await walletClient.writeContract(request);
  metaSet(db, key, hash);
  recordJob(db, {
    id: key,
    kind: request.functionName ?? "job",
    status: "submitted",
    txHash: hash,
    detail: { to: request.address },
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  recordJob(db, {
    id: key,
    kind: request.functionName ?? "job",
    status: receipt.status === "success" ? "confirmed" : "reverted",
    txHash: hash,
    detail: { to: request.address, blockNumber: receipt.blockNumber.toString() },
  });
  return { hash, receipt, recovered: false };
}
