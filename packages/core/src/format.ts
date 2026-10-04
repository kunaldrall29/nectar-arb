/** Exact integer formatting for token amounts. Never uses floating point for value math (PRD Section 8). */
export function formatUnitsExact(value: bigint | string, decimals: number, maxFraction = decimals): string {
  let v = typeof value === "string" ? BigInt(value) : value;
  const neg = v < 0n;
  if (neg) v = -v;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${frac ? "." + frac : ""}`;
}

/** Parse a user-entered decimal string into base units without floats. Throws on invalid input. */
export function parseUnitsExact(input: string, decimals: number): bigint {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") throw new Error("Enter a number");
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

/** Oracle price (1e36-scaled, per base unit) → loan-token base units per whole collateral token. */
export function oraclePriceToLoanUnits(price: bigint, collateralDecimals: number): bigint {
  return (price * 10n ** BigInt(collateralDecimals)) / 10n ** 36n;
}

export function shortAddr(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function bpsOf(amount: bigint, bps: bigint) {
  return (amount * bps) / 10_000n;
}

export function mulDivUp(a: bigint, b: bigint, c: bigint) {
  return (a * b + c - 1n) / c;
}
