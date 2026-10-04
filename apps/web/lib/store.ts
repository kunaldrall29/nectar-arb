type IdemRecord = { hash: string; body: unknown; status: number; at: number };
type Alert = { id: string; channel: string; createdAt: string; wallet?: string };
type QuoteRequest = { id: string; body: unknown; createdAt: string };
type JobRecord = {
  jobId: string;
  chainId: number;
  txHash?: string;
  state: string;
  reason?: string;
  createdAt: string;
  quoteId?: string;
};

const idem = new Map<string, IdemRecord>();
const alerts: Alert[] = [];
const quoteRequests: QuoteRequest[] = [];
const jobs = new Map<string, JobRecord>();
const challenges = new Map<string, { nonce: string; exp: number }>();

export function getIdem(key: string): IdemRecord | undefined {
  return idem.get(key);
}
export function setIdem(key: string, rec: IdemRecord) {
  idem.set(key, rec);
}

export function addAlert(a: Alert) {
  alerts.unshift(a);
  return a;
}
export function listAlerts() {
  return alerts;
}

export function addQuoteRequest(q: QuoteRequest) {
  quoteRequests.unshift(q);
  return q;
}
export function listQuoteRequests() {
  return quoteRequests;
}

export function putJob(j: JobRecord) {
  jobs.set(j.jobId, j);
  return j;
}
export function getJob(id: string) {
  return jobs.get(id);
}
export function listJobs() {
  return [...jobs.values()];
}

export function putChallenge(wallet: string, nonce: string, exp: number) {
  challenges.set(wallet.toLowerCase(), { nonce, exp });
}
export function getChallenge(wallet: string) {
  return challenges.get(wallet.toLowerCase());
}
