/** Integer token amounts only. Display conversion never uses floating point. */

export function parseUnits(value: string, decimals: number): bigint {
  const raw = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error("Enter a positive amount using digits only.");
  }
  const [whole, frac = ""] = raw.split(".");
  if (frac.length > decimals) {
    throw new Error(`Use at most ${decimals} decimal places for this asset.`);
  }
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const base = 10n ** BigInt(decimals);
  return BigInt(whole) * base + BigInt(padded || "0");
}

export function formatUnits(amount: bigint, decimals: number, maxFrac = 4): string {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0");
  const trimmed = fraction.slice(0, maxFrac).replace(/0+$/, "");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = trimmed.length > 0 ? `${grouped}.${trimmed}` : grouped;
  return negative ? `-${body}` : body;
}
