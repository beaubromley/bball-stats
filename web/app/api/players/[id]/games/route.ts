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
      winner_ranked AS (
        SELECT
          r.game_id,
          r.player_id,
          ROW_NUMBER() OVER (
            PARTITION BY r.game_id
            ORDER BY COALESCE(pgs_fp.fp, 0) DESC,
                     COALESCE(pgs_fp.pts, 0) DESC,
                     COALESCE(pgs_fp.asts, 0) DESC,
                     r.player_id ASC
          ) as rn
        FROM rosters r
        JOIN games g ON g.id = r.game_id AND r.team = g.winning_team
        LEFT JOIN pgs_fp ON pgs_fp.game_id = r.game_id AND pgs_fp.player_id = r.player_id
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
        CASE WHEN wr.rn = 1 THEN 1 ELSE 0 END as is_mvp,
        (SELECT COUNT(*) FROM games g2 WHERE g2.status = 'finished' AND g2.start_time <= g.start_time) as game_number
      FROM rosters r
      JOIN games g ON r.game_id = g.id
      LEFT JOIN pgs_fp ON pgs_fp.game_id = g.id AND pgs_fp.player_id = r.player_id
      LEFT JOIN team_scores ts_a ON ts_a.game_id = g.id AND ts_a.team = 'A'
      LEFT JOIN team_scores ts_b ON ts_b.game_id = g.id AND ts_b.team = 'B'
      LEFT JOIN winner_ranked wr ON wr.game_id = g.id AND wr.player_id = r.player_id
      WHERE r.player_id = ? AND g.status = 'finished'
      ORDER BY g.start_time DESC
    `,
    args: [id],
  });
  return NextResponse.json(result.rows);
}
