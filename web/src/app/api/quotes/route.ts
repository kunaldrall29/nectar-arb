import { NextResponse } from "next/server";
import { getSnapshot, tryLive } from "@/lib/data";

export async function GET() {
  const live = await tryLive<{ quotes: unknown[] }>("/api/quotes");
  if (live) return NextResponse.json(live);
  return NextResponse.json({ quotes: getSnapshot().quotes, source: "bundled-snapshot" });
}
