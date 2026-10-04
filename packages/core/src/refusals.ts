/** Mirrors NectarExecutor.Refusal and PRD Section 15 failure codes with user-facing explanations. */
export const REFUSAL_CODES = [
  "OK",
  "KEEPER_NOT_ALLOWED",
  "QUOTE_NOT_FUNDED",
  "QUOTE_EXPIRED",
  "JOB_EXPIRED",
  "WRONG_POSITION",
  "UNSUPPORTED_MARKET",
  "SCOPE_PAUSED",
  "POLICY_VERSION_MISMATCH",
  "PRICE_UNAVAILABLE",
  "POSITION_HEALTHY",
  "POSITION_CHANGED",
  "DEBT_EXCEEDS_BOUND",
  "INSUFFICIENT_PROCEEDS",
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number] | "NO_FUNDED_QUOTE" | "SIMULATION_REVERTED" | "RPC_UNAVAILABLE";

export const REFUSAL_TEXT: Record<RefusalCode, string> = {
  OK: "Eligible: the job passed every executor check.",
  KEEPER_NOT_ALLOWED: "This deployment uses a keeper allowlist and the submitting account is not on it.",
  QUOTE_NOT_FUNDED: "The quote has no live funded reservation (never registered, already filled or released).",
  QUOTE_EXPIRED: "The quote reached validUntil; execution stops and the reservation can be released.",
  JOB_EXPIRED: "The job deadline passed before inclusion.",
  WRONG_POSITION: "The quote is scoped to a different borrower position.",
  UNSUPPORTED_MARKET: "Nectar has no approved execution path for this market; read-only monitoring only.",
  SCOPE_PAUSED: "A guardian pause blocks new executions for this scope. Unreserved withdrawals remain available.",
  POLICY_VERSION_MISMATCH: "The market policy changed since the quote was signed; the old terms cannot execute.",
  PRICE_UNAVAILABLE: "A required price is stale, paused, future-dated or invalid, so execution is stopped.",
  POSITION_HEALTHY: "The position is not liquidatable under the lending market's own rules.",
  POSITION_CHANGED: "The loan changed (repaid, liquidated by someone else, or collateral below the quoted amount).",
  DEBT_EXCEEDS_BOUND: "Actual debt repayment would exceed the quote's signed maxDebtRepay.",
  INSUFFICIENT_PROCEEDS: "The quote's cash cannot cover repayment plus declared fees and minimum surplus.",
  NO_FUNDED_QUOTE: "Unserved exposure: no active funded quote covers this position.",
  SIMULATION_REVERTED: "The full eth_call simulation reverted; nothing was submitted.",
  RPC_UNAVAILABLE: "Chain state could not be read reliably; showing the last observation as stale.",
};
