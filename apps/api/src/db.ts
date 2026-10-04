import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbPath = resolve(process.cwd(), "data/nectar.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS indexed_events (
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  contract TEXT NOT NULL,
  event_name TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maker_accounts (
  chain_id INTEGER NOT NULL,
  wallet TEXT NOT NULL,
  token TEXT NOT NULL,
  balance TEXT NOT NULL,
  reserved TEXT NOT NULL,
  available TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  PRIMARY KEY (chain_id, wallet, token)
);

CREATE TABLE IF NOT EXISTS quotes (
  reservation_id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  maker TEXT NOT NULL,
  token TEXT NOT NULL,
  amount TEXT NOT NULL,
  valid_until INTEGER NOT NULL,
  status TEXT NOT NULL,
  block_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  job_id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  market_key TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  borrower TEXT NOT NULL,
  debt_repaid TEXT NOT NULL,
  collateral_amount TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  payload TEXT NOT NULL
);
`);
