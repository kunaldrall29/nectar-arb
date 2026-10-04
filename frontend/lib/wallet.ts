"use client";

const KEY = "nectar.session.secret";
const PUB = "nectar.session.public";

export function loadWallet() {
  if (typeof window === "undefined") return null;
  const secret = sessionStorage.getItem(KEY);
  const publicKey = sessionStorage.getItem(PUB);
  if (!secret || !publicKey) return null;
  return { secret, publicKey };
}

export async function createWallet() {
  const data = await api("/wallet/create", { method: "POST" });
  sessionStorage.setItem(KEY, data.secret);
  sessionStorage.setItem(PUB, data.publicKey);
  return { secret: data.secret as string, publicKey: data.publicKey as string };
}

export function clearWallet() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(PUB);
}

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
