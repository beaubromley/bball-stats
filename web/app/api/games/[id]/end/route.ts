import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { endGame } from "@/lib/events";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { winning_team } = await req.json();

  if (winning_team !== "A" && winning_team !== "B") {
    return NextResponse.json(
      { error: 'winning_team must be "A" or "B"' },
      { status: 400 }
    );
  }

  await endGame(id, winning_team);
  return NextResponse.json({ ok: true });
}
