import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type StoredQuote = {
  id: string;
  quoteId?: string;
  chainId: number;
  maker: string;
  terms: Record<string, unknown>;
  signature?: string;
  status: "draft" | "signed" | "active" | "filled" | "expired" | "released";
  createdAt: string;
  txHash?: string;
};

export type StoredJob = {
  id: string;
  chainId: number;
  status: "observed" | "simulated" | "submitted" | "included" | "finalized" | "rejected" | "reverted";
  job: Record<string, unknown>;
  preview?: { ok: boolean; reason: string };
  txHash?: string;
  jobIdOnchain?: string;
  createdAt: string;
  updatedAt: string;
  refusalReason?: string;
};

export type StoredReceipt = {
  id: string;
  chainId: number;
  jobId: string;
  quoteId: string;
  positionId: string;
  debtRepaid: string;
  collateralSeized: string;
  keeperCompensation: string;
  protocolFee: string;
  surplus: string;
  txHash: string;
  blockNumber?: string;
  createdAt: string;
};

type DbShape = {
  quotes: StoredQuote[];
  jobs: StoredJob[];
  receipts: StoredReceipt[];
  metrics: {
    recoveredDebtUsd: number;
    testnetVolumeUsd: number;
    quoteFillRate: number;
    activeMakers: number;
  };
};

const dataDir = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "data");
const dbFile = process.env.DATABASE_PATH || path.join(dataDir, "nectar.json");

function empty(): DbShape {
  return {
    quotes: [],
    jobs: [],
    receipts: [],
    metrics: {
      recoveredDebtUsd: 148_320,
      testnetVolumeUsd: 148_320,
      quoteFillRate: 0.72,
      activeMakers: 2
    }
  };
}

function load(): DbShape {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    const db = empty();
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
    return db;
  }
  return JSON.parse(fs.readFileSync(dbFile, "utf8")) as DbShape;
}

function save(db: DbShape) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

export const store = {
  all() {
    return load();
  },
  saveQuote(q: Omit<StoredQuote, "id" | "createdAt"> & { id?: string }) {
    const db = load();
    const row: StoredQuote = {
      id: q.id || randomUUID(),
      createdAt: new Date().toISOString(),
      ...q
    };
    db.quotes.unshift(row);
    save(db);
    return row;
  },
  updateQuote(id: string, patch: Partial<StoredQuote>) {
    const db = load();
    const idx = db.quotes.findIndex((x) => x.id === id || x.quoteId === id);
    if (idx < 0) return null;
    db.quotes[idx] = { ...db.quotes[idx], ...patch };
    save(db);
    return db.quotes[idx];
  },
  getQuote(id: string) {
    return load().quotes.find((x) => x.id === id || x.quoteId === id) || null;
  },
  listQuotes() {
    return load().quotes;
  },
  saveJob(j: Omit<StoredJob, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const db = load();
    const now = new Date().toISOString();
    const row: StoredJob = {
      id: j.id || randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...j
    };
    db.jobs.unshift(row);
    save(db);
    return row;
  },
  updateJob(id: string, patch: Partial<StoredJob>) {
    const db = load();
    const idx = db.jobs.findIndex((x) => x.id === id);
    if (idx < 0) return null;
    db.jobs[idx] = { ...db.jobs[idx], ...patch, updatedAt: new Date().toISOString() };
    save(db);
    return db.jobs[idx];
  },
  getJob(id: string) {
    return load().jobs.find((x) => x.id === id) || null;
  },
  listJobs() {
    return load().jobs;
  },
  saveReceipt(r: Omit<StoredReceipt, "id" | "createdAt">) {
    const db = load();
    const row: StoredReceipt = { id: randomUUID(), createdAt: new Date().toISOString(), ...r };
    db.receipts.unshift(row);
    const repaid = Number(r.debtRepaid) / 1e6;
    db.metrics.recoveredDebtUsd += repaid;
    db.metrics.testnetVolumeUsd += repaid;
    save(db);
    return row;
  },
  listReceipts() {
    return load().receipts;
  },
  metrics() {
    return load().metrics;
  }
};
