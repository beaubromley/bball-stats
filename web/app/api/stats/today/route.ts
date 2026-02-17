import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { getTodayStats } from "@/lib/stats";

export async function GET(req: NextRequest) {
  await initDb();
  const dateStr = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const stats = await getTodayStats(dateStr);
  return NextResponse.json(stats);
}
