import { getDb } from "./turso";
import { getLeaderboard } from "./stats";

export type SingleGameStat = "points" | "assists" | "steals" | "blocks" | "fantasy_points";

export interface SingleGameRecord {
  stat: SingleGameStat;
  player_id: string;
  player_name: string;
  value: number;
  game_id: string;
  start_time: string;
}

export type MilestoneStat = "points" | "assists" | "steals" | "blocks" | "games";

export interface MilestoneAlert {
  player_id: string;
  player_name: string;
  stat: MilestoneStat;
  current: number;
  next_milestone: number;
  remaining: number;
}

// Career milestone thresholds. User intent: smallest threshold is 50, no
// thresholds below that.
const MILESTONES: Record<MilestoneStat, number[]> = {
  points: [50, 100, 250, 500, 1000, 2500, 5000],
  assists: [50, 100, 250, 500, 1000],
  steals: [50, 100, 250, 500],
  blocks: [50, 100, 250, 500],
  games: [50, 100, 250, 500],
};

// How close a player must be to the next milestone to appear in the watch list.
// Scales with the milestone size so a player at 980 points still surfaces for
// the 1000-point milestone.
function approachThreshold(milestone: number): number {
  if (milestone <= 100) return 5;
  if (milestone <= 500) return 15;
  if (milestone <= 1000) return 30;
  return 100;
}

function nextMilestone(value: number, list: number[]): number | null {
  for (const m of list) if (value < m) return m;
  return null;
}

/**
 * All-time single-game high in each tracked stat. Returns the single best
 * performance per stat (points / assists / steals / blocks / fantasy_points).
 * Tiebreaker: most recent game wins (start_time DESC).
 */
export async function getSingleGameRecords(): Promise<SingleGameRecord[]> {
  const db = getDb();

  const result = await db.execute(`
    SELECT
      r.game_id,
      r.player_id,
      p.name AS player_name,
      g.start_time,
      COALESCE(SUM(CASE WHEN ge.event_type IN ('score','correction') THEN ge.point_value ELSE 0 END), 0) AS pts,
      COALESCE(SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END), 0) AS asts,
      COALESCE(SUM(CASE WHEN ge.event_type = 'steal'  THEN 1 ELSE 0 END), 0) AS stls,
      COALESCE(SUM(CASE WHEN ge.event_type = 'block'  THEN 1 ELSE 0 END), 0) AS blks
    FROM rosters r
    JOIN players p ON p.id = r.player_id
    JOIN games g ON g.id = r.game_id AND g.status = 'finished'
    LEFT JOIN game_events ge ON ge.game_id = r.game_id AND ge.player_id = r.player_id
    GROUP BY r.game_id, r.player_id, p.name, g.start_time
  `);

  const rows = result.rows.map((row) => ({
    game_id: row.game_id as string,
    player_id: row.player_id as string,
    player_name: row.player_name as string,
    start_time: row.start_time as string,
    pts: Number(row.pts),
    asts: Number(row.asts),
    stls: Number(row.stls),
    blks: Number(row.blks),
    fp: Number(row.pts) + Number(row.asts) + Number(row.stls) + Number(row.blks),
  }));

  if (rows.length === 0) return [];

  function pickMax(
    key: "pts" | "asts" | "stls" | "blks" | "fp",
    statName: SingleGameStat,
  ): SingleGameRecord {
    let best = rows[0];
    for (const r of rows) {
      if (
        r[key] > best[key] ||
        (r[key] === best[key] && r.start_time > best.start_time)
      ) {
        best = r;
      }
    }
    return {
      stat: statName,
      player_id: best.player_id,
      player_name: best.player_name,
      value: best[key],
      game_id: best.game_id,
      start_time: best.start_time,
    };
  }

  return [
    pickMax("pts", "points"),
    pickMax("asts", "assists"),
    pickMax("stls", "steals"),
    pickMax("blks", "blocks"),
    pickMax("fp", "fantasy_points"),
  ];
}

/**
 * Players approaching their next career milestone in any tracked stat.
 * Sorted by smallest "remaining" first (closest to crossing the line).
 */
export async function getMilestoneWatch(): Promise<MilestoneAlert[]> {
  const lb = await getLeaderboard();
  const alerts: MilestoneAlert[] = [];

  for (const p of lb) {
    const checks: { stat: MilestoneStat; value: number }[] = [
      { stat: "points", value: p.total_points },
      { stat: "assists", value: p.assists },
      { stat: "steals", value: p.steals },
      { stat: "blocks", value: p.blocks },
      { stat: "games", value: p.games_played },
    ];
    for (const c of checks) {
      const next = nextMilestone(c.value, MILESTONES[c.stat]);
      if (next === null) continue;
      const remaining = next - c.value;
      if (remaining > 0 && remaining <= approachThreshold(next)) {
        alerts.push({
          player_id: p.id,
          player_name: p.name,
          stat: c.stat,
          current: c.value,
          next_milestone: next,
          remaining,
        });
      }
    }
  }

  alerts.sort((a, b) => a.remaining - b.remaining);
  return alerts;
}
