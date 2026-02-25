import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { getTodayStats } from "@/lib/stats";

export async function GET(req: NextRequest) {
  await initDb();
  const dateStr = req.nextUrl.searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const stats = await getTodayStats(dateStr);
  return NextResponse.json(stats);
}
