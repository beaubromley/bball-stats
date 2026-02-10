import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await params;
  const db = getDb();

  const result = await db.execute({
    sql: `
      SELECT g.id, g.start_time, g.status, g.winning_team, r.team,
             CASE WHEN g.winning_team = r.team THEN 'W' ELSE 'L' END as result,
             COALESCE(pts.points, 0) as points_scored
      FROM rosters r
      JOIN games g ON r.game_id = g.id
      LEFT JOIN (
        SELECT game_id, player_id, SUM(point_value) as points
        FROM game_events
        GROUP BY game_id, player_id
      ) pts ON pts.game_id = g.id AND pts.player_id = r.player_id
      WHERE r.player_id = ? AND g.status = 'finished'
      ORDER BY g.start_time DESC
    `,
    args: [id],
  });
  return NextResponse.json(result.rows);
}
