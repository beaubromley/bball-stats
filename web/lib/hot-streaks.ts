import { unstable_cache } from "next/cache";
import { getDb, initDb } from "./turso";
import { TAG_STATS } from "./cache-tags";

export interface HotStreakEntry {
  player_id: string;
  name: string;
  last5_fpg: number;
  career_fpg: number;
  /** last5_fpg / career_fpg. Always ≥1.20 when surfaced. */
  ratio: number;
}

/** Threshold: last-5 FPG must be at least this multiple of career FPG. */
const HOT_RATIO = 1.2;
/** Minimum career games for the comparison to be meaningful. */
const MIN_CAREER_GAMES = 5;
/** Recent activity: 5th-most-recent game must fall within this window. */
const RECENT_WINDOW_DAYS = 14;

interface Row {
  player_id: string;
  name: string;
  fantasy_points: number;
  effective_games: number;
  start_time: string;
}

async function _getHotStreaks(): Promise<HotStreakEntry[]> {
  await initDb();
  const db = getDb();

  const res = await db.execute({
    sql: `
      SELECT pgs.player_id, p.name, pgs.fantasy_points, pgs.effective_games, pgs.start_time
      FROM player_game_stats pgs
      JOIN players p ON p.id = pgs.player_id
      WHERE pgs.game_status = 'finished'
      ORDER BY pgs.player_id, pgs.start_time DESC
    `,
    args: [],
  });
  const rows = res.rows as unknown as Row[];

  const byPlayer = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
    byPlayer.get(r.player_id)!.push(r);
  }

  const cutoff = new Date(
    Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const out: HotStreakEntry[] = [];
  for (const [pid, games] of byPlayer) {
    if (games.length < MIN_CAREER_GAMES) continue;
    // games[] is sorted DESC; first 5 are the most recent.
    const last5 = games.slice(0, 5);
    // Anchor recency on the 5th-most-recent game — the oldest of the
    // five must still be within the recent window.
    const oldestOfFive = last5[last5.length - 1].start_time;
    if (oldestOfFive < cutoff) continue;

    const last5Fp = last5.reduce((s, g) => s + Number(g.fantasy_points), 0);
    const last5Eg = last5.reduce((s, g) => s + Number(g.effective_games), 0);
    const careerFp = games.reduce((s, g) => s + Number(g.fantasy_points), 0);
    const careerEg = games.reduce((s, g) => s + Number(g.effective_games), 0);

    if (last5Eg <= 0 || careerEg <= 0) continue;
    const last5Fpg = last5Fp / last5Eg;
    const careerFpg = careerFp / careerEg;
    if (careerFpg <= 0) continue;
    const ratio = last5Fpg / careerFpg;
    if (ratio < HOT_RATIO) continue;

    out.push({
      player_id: pid,
      name: games[0].name,
      last5_fpg: Math.round(last5Fpg * 100) / 100,
      career_fpg: Math.round(careerFpg * 100) / 100,
      ratio: Math.round(ratio * 100) / 100,
    });
  }

  return out.sort((a, b) => b.ratio - a.ratio);
}

export const getHotStreaks = unstable_cache(
  _getHotStreaks,
  ["getHotStreaks"],
  { tags: [TAG_STATS], revalidate: 86400 },
);
