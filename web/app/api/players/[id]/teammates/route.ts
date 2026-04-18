import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await params;
  const db = getDb();

  const result = await db.execute({
    sql: `
      WITH teammate_games AS (
        SELECT
          r1.game_id,
          r2.player_id as teammate_id,
          CASE WHEN r1.team = g.winning_team THEN 1 ELSE 0 END as is_win
        FROM rosters r1
        JOIN rosters r2 ON r1.game_id = r2.game_id AND r1.team = r2.team AND r2.player_id != r1.player_id
        JOIN games g ON g.id = r1.game_id
        WHERE r1.player_id = ? AND g.status = 'finished'
      ),
      assists_given AS (
        SELECT score_ev.player_id as scorer_id, COUNT(*) as cnt
        FROM game_events assist_ev
        JOIN game_events score_ev ON assist_ev.assisted_event_id = score_ev.id
        WHERE assist_ev.player_id = ? AND assist_ev.event_type = 'assist'
        GROUP BY score_ev.player_id
      ),
      assists_received AS (
        SELECT assist_ev.player_id as assister_id, COUNT(*) as cnt
        FROM game_events score_ev
        JOIN game_events assist_ev ON assist_ev.assisted_event_id = score_ev.id AND assist_ev.event_type = 'assist'
        WHERE score_ev.player_id = ?
        GROUP BY assist_ev.player_id
      )
      SELECT
        p.id,
        p.name,
        COUNT(tg.game_id) as games_together,
        SUM(tg.is_win) as wins_together,
        COUNT(tg.game_id) - SUM(tg.is_win) as losses_together,
        COALESCE(ag.cnt, 0) as assists_to_teammate,
        COALESCE(ar.cnt, 0) as assists_from_teammate,
        ROUND(CAST(SUM(tg.is_win) AS REAL) * 100 / NULLIF(COUNT(tg.game_id), 0), 1) as win_pct
      FROM teammate_games tg
      JOIN players p ON p.id = tg.teammate_id
      LEFT JOIN assists_given ag ON ag.scorer_id = p.id
      LEFT JOIN assists_received ar ON ar.assister_id = p.id
      GROUP BY p.id, p.name, ag.cnt, ar.cnt
      ORDER BY games_together DESC
    `,
    args: [id, id, id],
  });
  return NextResponse.json(result.rows);
}
