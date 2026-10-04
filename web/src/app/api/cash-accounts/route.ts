import { NextResponse } from "next/server";
import { getSnapshot, tryLive } from "@/lib/data";

export async function GET() {
  const live = await tryLive<{ accounts: unknown[] }>("/api/cash-accounts");
  if (live) return NextResponse.json(live);
  return NextResponse.json({ accounts: getSnapshot().cashAccounts, source: "bundled-snapshot" });
}
