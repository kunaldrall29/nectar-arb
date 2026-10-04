import { NextResponse } from "next/server";
import { getSnapshot, tryLive } from "@/lib/data";

export async function GET() {
  const live = await tryLive<Record<string, unknown>>("/api/overview");
  if (live) return NextResponse.json(live);
  const s = getSnapshot();
  return NextResponse.json(s.overview ?? { environment: "TESTNET" });
}
