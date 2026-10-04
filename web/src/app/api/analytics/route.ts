import { NextResponse } from "next/server";
import { getSnapshot, tryLive } from "@/lib/data";

export async function GET() {
  const live = await tryLive<Record<string, unknown>>("/api/analytics");
  if (live) return NextResponse.json(live);
  return NextResponse.json(getSnapshot().analytics);
}
