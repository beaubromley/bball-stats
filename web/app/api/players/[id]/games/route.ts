import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await params;
  const db = getDb();

  const result = await db.execute({
    sql: `
      WITH pgs AS (
        SELECT
          ge.game_id,
          ge.player_id,
          SUM(CASE WHEN ge.event_type IN ('score','correction') THEN ge.point_value ELSE 0 END) as pts,
          SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END) as asts,
          SUM(CASE WHEN ge.event_type = 'steal' THEN 1 ELSE 0 END) as stls,
          SUM(CASE WHEN ge.event_type = 'block' THEN 1 ELSE 0 END) as blks
        FROM game_events ge
        GROUP BY ge.game_id, ge.player_id
      ),
      pgs_fp AS (
        SELECT game_id, player_id, pts, asts, stls, blks,
               COALESCE(pts,0) + COALESCE(asts,0) + COALESCE(stls,0) + COALESCE(blks,0) as fp
        FROM pgs
      ),
      team_scores AS (
        SELECT r.game_id, r.team,
               SUM(COALESCE(pgs_fp.pts, 0)) as score
        FROM rosters r
        LEFT JOIN pgs_fp ON pgs_fp.game_id = r.game_id AND pgs_fp.player_id = r.player_id
        GROUP BY r.game_id, r.team
      ),
      winner_max_fp AS (
        SELECT r.game_id, MAX(COALESCE(pgs_fp.fp, 0)) as max_fp
        FROM rosters r
        JOIN games g ON g.id = r.game_id AND r.team = g.winning_team
        LEFT JOIN pgs_fp ON pgs_fp.game_id = r.game_id AND pgs_fp.player_id = r.player_id
        GROUP BY r.game_id
      )
      SELECT
        g.id, g.start_time, g.status, g.winning_team, r.team,
        CASE WHEN g.winning_team = r.team THEN 'W' ELSE 'L' END as result,
        COALESCE(pgs_fp.pts, 0) as points_scored,
        COALESCE(pgs_fp.asts, 0) as assists,
        COALESCE(pgs_fp.stls, 0) as steals,
        COALESCE(pgs_fp.blks, 0) as blocks,
        COALESCE(pgs_fp.fp, 0) as fantasy_points,
        COALESCE(ts_a.score, 0) as team_a_score,
        COALESCE(ts_b.score, 0) as team_b_score,
        MAX(COALESCE(ts_a.score, 0), COALESCE(ts_b.score, 0)) as winning_score,
        CASE WHEN r.team = g.winning_team AND COALESCE(pgs_fp.fp, 0) = wmf.max_fp THEN 1 ELSE 0 END as is_mvp
      FROM rosters r
      JOIN games g ON r.game_id = g.id
      LEFT JOIN pgs_fp ON pgs_fp.game_id = g.id AND pgs_fp.player_id = r.player_id
      LEFT JOIN team_scores ts_a ON ts_a.game_id = g.id AND ts_a.team = 'A'
      LEFT JOIN team_scores ts_b ON ts_b.game_id = g.id AND ts_b.team = 'B'
      LEFT JOIN winner_max_fp wmf ON wmf.game_id = g.id
      WHERE r.player_id = ? AND g.status = 'finished'
      ORDER BY g.start_time DESC
    `,
    args: [id],
  });
  return NextResponse.json(result.rows);
}
