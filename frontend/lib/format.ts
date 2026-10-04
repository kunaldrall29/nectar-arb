export function fromBase(amount: string | number | bigint, decimals = 7) {
  const value = BigInt(amount || 0);
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

export function usd(amount: string | number | bigint, decimals = 7) {
  const n = Number(fromBase(amount, decimals));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function shortAddr(value?: string, size = 4) {
  if (!value) return "—";
  if (value.length <= size * 2 + 3) return value;
  return `${value.slice(0, size + 1)}…${value.slice(-size)}`;
}

export function age(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
