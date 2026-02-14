import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { createGame } from "@/lib/events";
import { getGameHistory } from "@/lib/stats";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  await initDb();
  const games = await getGameHistory();
  return NextResponse.json(games);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { location, target_score, scoring_mode } = await req.json();
  const id = await createGame(location, target_score, scoring_mode);
  return NextResponse.json({ id }, { status: 201 });
}
