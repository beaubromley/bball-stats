import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { setRoster, ensurePlayer } from "@/lib/events";
import { getDb } from "@/lib/turso";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { team_a, team_b } = await req.json();

  if (!Array.isArray(team_a) || !Array.isArray(team_b)) {
    return NextResponse.json(
      { error: "team_a and team_b must be arrays of names" },
      { status: 400 }
    );
  }

  await setRoster(id, team_a, team_b);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { player_name, new_team } = await req.json();

  if (!player_name || !new_team) {
    return NextResponse.json({ error: "player_name and new_team required" }, { status: 400 });
  }

  const db = getDb();
  const playerId = await ensurePlayer(player_name);
  await db.execute({
    sql: "INSERT OR REPLACE INTO rosters (game_id, player_id, team) VALUES (?, ?, ?)",
    args: [id, playerId, new_team],
  });
  return NextResponse.json({ ok: true });
}
