import { NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { getLeaderboard } from "@/lib/stats";

export async function GET() {
  await initDb();
  const leaderboard = await getLeaderboard();
  return NextResponse.json(leaderboard);
}
