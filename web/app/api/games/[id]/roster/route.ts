import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { setRoster, ensurePlayer } from "@/lib/events";
import { getDb } from "@/lib/turso";
import { requireAuth } from "@/lib/auth";
import { bustStatsCache } from "@/lib/cache-tags";
import { refreshGameStats } from "@/lib/player-game-stats";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { team_a, team_b, full_names } = await req.json();

  if (!Array.isArray(team_a) || !Array.isArray(team_b)) {
    return NextResponse.json(
      { error: "team_a and team_b must be arrays of names" },
      { status: 400 }
    );
  }

  await setRoster(id, team_a, team_b, full_names);
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
  await refreshGameStats(id);
  bustStatsCache();
  return NextResponse.json({ ok: true });
}

/**
 * Remove a player from the roster of an in-progress game. Refuses if
 * the player already has any events recorded — those rows can't be
 * cleanly dropped without rewriting stats history. Use undo first if
 * you logged something against the wrong player.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const playerName = searchParams.get("player_name");
  if (!playerName) {
    return NextResponse.json({ error: "player_name required" }, { status: 400 });
  }

  const db = getDb();
  const playerId = await ensurePlayer(playerName);

  const events = await db.execute({
    sql: "SELECT COUNT(*) AS cnt FROM game_events WHERE game_id = ? AND player_id = ?",
    args: [id, playerId],
  });
  const cnt = Number(events.rows[0]?.cnt ?? 0);
  if (cnt > 0) {
    return NextResponse.json(
      { error: `Player has ${cnt} event${cnt === 1 ? "" : "s"} recorded — undo them first.` },
      { status: 409 },
    );
  }

  await db.execute({
    sql: "DELETE FROM rosters WHERE game_id = ? AND player_id = ?",
    args: [id, playerId],
  });
  await refreshGameStats(id);
  bustStatsCache();
  return NextResponse.json({ ok: true });
}
