import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { getGameNumber } from "@/lib/stats";
import { requireAuth } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await params;
  const db = getDb();

  const game = await db.execute({
    sql: "SELECT * FROM games WHERE id = ?",
    args: [id],
  });
  if (game.rows.length === 0) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const roster = await db.execute({
    sql: `SELECT r.team, p.name FROM rosters r JOIN players p ON r.player_id = p.id WHERE r.game_id = ? ORDER BY r.team, p.name`,
    args: [id],
  });
  const teamA = roster.rows.filter((r) => r.team === "A").map((r) => r.name);
  const teamB = roster.rows.filter((r) => r.team === "B").map((r) => r.name);

  const gameNumber = await getGameNumber(id);
  return NextResponse.json({ ...game.rows[0], team_a: teamA, team_b: teamB, game_number: gameNumber });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const db = getDb();

  const body = await req.json();
  const { notes } = body;

  if (notes === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.execute({
    sql: "UPDATE games SET notes = ? WHERE id = ?",
    args: [notes || null, id],
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const db = getDb();

  await db.execute({ sql: "DELETE FROM game_transcripts WHERE game_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM game_events WHERE game_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM rosters WHERE game_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM games WHERE id = ?", args: [id] });

  return NextResponse.json({ ok: true });
}
