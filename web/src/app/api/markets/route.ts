import { NextResponse } from "next/server";
import { getSnapshot, tryLive } from "@/lib/data";

export async function GET() {
  const live = await tryLive<{ markets: unknown[] }>("/api/markets");
  if (live) return NextResponse.json(live);
  return NextResponse.json({ markets: getSnapshot().markets, stale: true, source: "bundled-snapshot" });
}
