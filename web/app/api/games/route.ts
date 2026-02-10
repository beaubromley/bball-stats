import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { createGame } from "@/lib/events";
import { getGameHistory } from "@/lib/stats";

export async function GET() {
  await initDb();
  const games = await getGameHistory();
  return NextResponse.json(games);
}

export async function POST(req: NextRequest) {
  await initDb();
  const { location } = await req.json();
  const id = await createGame(location);
  return NextResponse.json({ id }, { status: 201 });
}
