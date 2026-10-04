import { NextResponse } from "next/server";

const LOCAL = process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";

/** Browser-safe JSON-RPC proxy for local Anvil (avoids CORS). */
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const upstream = await fetch(LOCAL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ error: "RPC_UNAVAILABLE", message: String(e) }, { status: 503 });
  }
}
