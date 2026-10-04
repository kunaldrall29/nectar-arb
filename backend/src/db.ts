import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new Database(process.env.DB_PATH ?? path.join(config.dataDir, "nectar.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL");

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,              -- networkKey:contract:txHash:logIndex
  network TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  contract TEXT NOT NULL,
  event_name TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  block_time INTEGER,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  args TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_by_name ON events(network, event_name, block_number);
CREATE TABLE IF NOT EXISTS blocks (network TEXT, number INTEGER, hash TEXT, PRIMARY KEY (network, number));
CREATE TABLE IF NOT EXISTS cursors (network TEXT PRIMARY KEY, last_block INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,           -- executor.jobIdFor(quoteId): one job per quote, ever
  network TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  quote_id TEXT NOT NULL,
  market_key TEXT,
  borrower TEXT,
  state TEXT NOT NULL,
  reason TEXT,
  keeper TEXT,
  nonce INTEGER,
  tx_hash TEXT,
  raw_tx TEXT,
  replaced_by TEXT,
  simulation TEXT,
  receipt TEXT,
  gas_used TEXT,
  gas_cost_wei TEXT,
  observed_block INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  history TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS jobs_by_state ON jobs(network, state);
CREATE TABLE IF NOT EXISTS signed_quotes (
  quote_id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  maker TEXT NOT NULL,
  terms TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

export function json(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
}

export type JobState =
  | "Observed"
  | "Simulated"
  | "Submitting"
  | "Submitted"
  | "Included"
  | "Finalized"
  | "Rejected"
  | "Reverted"
  | "Expired"
  | "Replaced"
  | "Reorged";

export interface JobRow {
  job_id: string;
  network: string;
  chain_id: number;
  quote_id: string;
  market_key: string | null;
  borrower: string | null;
  state: JobState;
  reason: string | null;
  keeper: string | null;
  nonce: number | null;
  tx_hash: string | null;
  raw_tx: string | null;
  replaced_by: string | null;
  simulation: string | null;
  receipt: string | null;
  gas_used: string | null;
  gas_cost_wei: string | null;
  observed_block: number | null;
  attempts: number;
  created_at: number;
  updated_at: number;
  history: string;
}

export function transitionJob(jobId: string, state: JobState, patch: Partial<JobRow> = {}) {
  const row = db.prepare("SELECT history FROM jobs WHERE job_id = ?").get(jobId) as { history: string } | undefined;
  if (!row) return;
  const history = JSON.parse(row.history) as unknown[];
  history.push({ state, at: Date.now(), reason: patch.reason ?? undefined, txHash: patch.tx_hash ?? undefined });
  const fields = { ...patch, state, updated_at: Date.now(), history: JSON.stringify(history) } as Record<string, unknown>;
  const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE jobs SET ${sets} WHERE job_id = @job_id`).run({ ...fields, job_id: jobId });
}
