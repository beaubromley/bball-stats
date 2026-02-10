import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { getBoxScore } from "@/lib/stats";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await params;
  const boxScore = await getBoxScore(id);
  if (!boxScore) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  return NextResponse.json(boxScore);
}
