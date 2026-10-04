export type JobRecord = {
  jobId: string;
  quoteId: number;
  status: string;
  txHash?: string;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

export type QuoteRecord = {
  quoteId: number;
  maker: string;
  marketKey: string;
  positionId: number;
  cashOut: string;
  status: string;
  txHash?: string;
  createdAt: string;
};

export type ReceiptRecord = {
  receiptId: number;
  quoteId: number;
  positionId: number;
  debtRepaid: string;
  collateralSeized: string;
  keeperCompensation: string;
  protocolFee: string;
  surplus: string;
  writeoff: string;
  txHash: string;
  createdAt: string;
};

const jobs = new Map<string, JobRecord>();
const quotes: QuoteRecord[] = [];
const receipts: ReceiptRecord[] = [
  {
    receiptId: 1,
    quoteId: 1,
    positionId: 1,
    debtRepaid: "100000000000",
    collateralSeized: "500000000",
    keeperCompensation: "500000000",
    protocolFee: "200000000",
    surplus: "700000000",
    writeoff: "0",
    txHash: "68bc043b07b5d09250ed63da11b5711cece8b1ce7a961d7128f2ff8ab7642fe5",
    createdAt: new Date().toISOString(),
  },
];

export const store = {
  jobs,
  quotes,
  receipts,
  addQuote(q: QuoteRecord) {
    quotes.unshift(q);
  },
  addReceipt(r: ReceiptRecord) {
    receipts.unshift(r);
  },
  upsertJob(j: JobRecord) {
    jobs.set(j.jobId, j);
  },
  getJob(id: string) {
    return jobs.get(id);
  },
};
