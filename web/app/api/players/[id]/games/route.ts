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
             COALESCE(SUM(CASE WHEN ge.event_type = 'score' THEN ge.point_value ELSE 0 END), 0) as points_scored,
             COALESCE(SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END), 0) as assists,
             COALESCE(SUM(CASE WHEN ge.event_type = 'steal' THEN 1 ELSE 0 END), 0) as steals,
             COALESCE(SUM(CASE WHEN ge.event_type = 'block' THEN 1 ELSE 0 END), 0) as blocks,
             COALESCE(gws.winning_score, 11) as winning_score
      FROM rosters r
      JOIN games g ON r.game_id = g.id
      LEFT JOIN game_events ge ON ge.game_id = g.id AND ge.player_id = r.player_id
      LEFT JOIN (
        SELECT ts.game_id, MAX(ts.team_score) as winning_score
        FROM (
          SELECT r2.game_id, r2.team, SUM(ge2.point_value) as team_score
          FROM game_events ge2
          JOIN rosters r2 ON ge2.game_id = r2.game_id AND ge2.player_id = r2.player_id
          GROUP BY r2.game_id, r2.team
        ) ts
        GROUP BY ts.game_id
      ) gws ON g.id = gws.game_id
      WHERE r.player_id = ? AND g.status = 'finished'
      GROUP BY g.id, g.start_time, g.status, g.winning_team, r.team
      ORDER BY g.start_time DESC
    `,
    args: [id],
  });
  return NextResponse.json(result.rows);
}
