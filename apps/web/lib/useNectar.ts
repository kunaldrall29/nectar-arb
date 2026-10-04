"use client";

import { useEffect, useState } from "react";

export function useApi<T>(path: string, refreshMs = 8000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch(path, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || res.statusText);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "RPC_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [path, refreshMs]);

  return { data, error, loading, reload: load };
}

export function chainQuery(filter: string) {
  if (filter === "all") return "";
  return `?chainId=${filter}`;
}

export function short(addr?: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function units(v?: string, decimals = 6) {
  if (v === "" || v == null) return "unavailable";
  try {
    const n = BigInt(v);
    const base = 10n ** BigInt(decimals);
    const whole = n / base;
    const frac = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
    return frac ? `${whole.toString()}.${frac}` : whole.toString();
  } catch {
    return v;
  }
}
