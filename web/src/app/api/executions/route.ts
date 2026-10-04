import { NextResponse } from "next/server";
import { getSnapshot, tryLive } from "@/lib/data";

export async function GET() {
  const live = await tryLive<{ executions: unknown[] }>("/api/executions");
  if (live) return NextResponse.json(live);
  return NextResponse.json({ executions: getSnapshot().executions, source: "bundled-snapshot" });
}
