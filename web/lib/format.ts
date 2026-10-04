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
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function formatUnits(amount: string | bigint | null | undefined, decimals: number, maxFrac = 2): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "bigint" ? amount : BigInt(amount);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0");
  const trimmed = fraction.slice(0, maxFrac).replace(/0+$/, "");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = trimmed ? `${grouped}.${trimmed}` : grouped;
  return negative ? `-${body}` : body;
}

export function formatUnitsRaw(amount: string, decimals: number): string {
  const value = BigInt(amount);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function shortAddr(value?: string | null) {
  if (!value) return "—";
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatTime(unixSeconds?: string | null) {
  if (!unixSeconds) return "—";
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(ms));
}
