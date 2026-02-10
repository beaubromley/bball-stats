import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { getPlayerStats } from "@/lib/stats";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await params;
  const stats = await getPlayerStats(id);
  if (!stats) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  return NextResponse.json(stats);
}
