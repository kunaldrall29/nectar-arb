/**
 * Browser calls same-origin `/api/v1/...` which proxies to the Express backend
 * (or serves demo fallbacks on Vercel when upstream is offline).
 * Server components can override with NEXT_PUBLIC_API_URL / API_UPSTREAM_URL.
 */
const DIRECT = process.env.NEXT_PUBLIC_API_URL;

function resolve(path: string) {
  if (DIRECT) return `${DIRECT}${path}`;
  // path is like /v1/markets → /api/v1/markets
  return `/api${path}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(resolve(path), { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `GET ${path} failed`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(resolve(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `web-${Date.now()}`
    },
    body: JSON.stringify(body ?? {})
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || `POST ${path} failed`);
  return json as T;
}

export const API_URL = DIRECT || "/api";
