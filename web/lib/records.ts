import { unstable_cache } from "next/cache";
import { getDb } from "./turso";
import { getLeaderboard, getSeasonGameIds } from "./stats";
import { getSeasonInfo, getSeasonForGameNumber } from "./seasons";
import { TAG_STATS } from "./cache-tags";

// =======================================================================
// Shared helpers
// =======================================================================

/**
 * Map of game_id -> { game_number, season } for every finished game.
 * Game number is 1-indexed in chronological (start_time) order. Season is
 * derived from GAMES_PER_SEASON.
 */
async function getGameNumberMap(): Promise<
  Map<string, { game_number: number; season: number }>
> {
  const db = getDb();
  const result = await db.execute(`
    SELECT id, ROW_NUMBER() OVER (ORDER BY start_time ASC) AS game_number
    FROM games
    WHERE status = 'finished'
  `);
  const map = new Map<string, { game_number: number; season: number }>();
  for (const row of result.rows) {
    const num = Number(row.game_number);
    map.set(row.id as string, {
      game_number: num,
      season: getSeasonForGameNumber(num),
    });
  }
  return map;
}

// =======================================================================
// Types
// =======================================================================

export type SingleGameStat = "points" | "assists" | "steals" | "blocks" | "fantasy_points";

export interface SingleGameRecord {
  category: "single_game";
  stat: SingleGameStat;
  player_id: string;
  player_name: string;
  value: number;
  game_id: string;
  start_time: string;
  game_number: number;
  season: number;
}

export type SeasonRecordStat =
  | "points"
  | "assists"
  | "steals"
  | "blocks"
  | "fantasy_points"
  | "wins";

export interface SeasonRecord {
  category: "season";
  stat: SeasonRecordStat;
  player_id: string;
  player_name: string;
  value: number;
  season: number;
  games_played: number;
}

export type GameRecordStat = "margin" | "comeback";

export interface GameRecord {
  category: "game";
  stat: GameRecordStat;
  game_id: string;
  start_time: string;
  value: number;
  team_a_score: number;
  team_b_score: number;
  winning_team: "A" | "B";
  team_a_players: string[];
  team_b_players: string[];
  game_number: number;
  season: number;
}

export type StreakKind = "win_streak" | "loss_streak";

export interface StreakRecord {
  category: "streak";
  stat: StreakKind;
  player_id: string;
  player_name: string;
  value: number;
  start_time: string; // start of first game in streak
  end_time: string;   // start of last game in streak
  start_game_id: string;
  end_game_id: string;
  start_game_number: number;
  end_game_number: number;
  start_season: number;
  end_season: number;
}

export type MilestoneStat = "points" | "assists" | "steals" | "blocks" | "games";

export interface MilestoneAlert {
  player_id: string;
  player_name: string;
  stat: MilestoneStat;
  current: number;
  next_milestone: number;
  remaining: number;
  kind: "approaching" | "achieved";
  /** ISO timestamp of the game in which the milestone was crossed (achieved kind only). */
  achieved_at?: string;
}

export interface RecordsBundle {
  single_game: SingleGameRecord[];
  season: SeasonRecord[];
  game: GameRecord[];
  streak: StreakRecord[];
  milestones: MilestoneAlert[];
}

// =======================================================================
// Milestones
// =======================================================================

const MILESTONES: Record<MilestoneStat, number[]> = {
  points: [50, 100, 250, 500, 1000, 2500, 5000],
  assists: [50, 100, 250, 500, 1000],
  steals: [50, 100, 250, 500],
  blocks: [50, 100, 250, 500],
  games: [50, 100, 250, 500],
};

const APPROACHING_THRESHOLD = 10;
const RECENT_DAYS = 7;
// "Approaching X" alerts only show for players who've played within this window.
// Otherwise we'd surface stale alerts for people who haven't shown up in months.
const APPROACHING_ACTIVE_DAYS = 14;

function nextMilestone(value: number, list: number[]): number | null {
  for (const m of list) if (value < m) return m;
  return null;
}

export async function getMilestoneWatch(): Promise<MilestoneAlert[]> {
  const db = getDb();
  const lb = await getLeaderboard();

  // Per-player per-game stat deltas (chronological) so we can detect when a
  // player crossed each milestone and surface "just achieved" alerts. Pulled
  // directly from the rollup — columns are pre-aggregated already.
  const perGameRes = await db.execute(`
    SELECT player_id, start_time, game_id,
           points AS pts, assists AS asts, steals AS stls, blocks AS blks
    FROM player_game_stats
    WHERE game_status = 'finished'
    ORDER BY player_id, start_time ASC, game_id ASC
  `);

  type PerGame = {
    start_time: string;
    pts: number;
    asts: number;
    stls: number;
    blks: number;
  };
  const byPlayer = new Map<string, PerGame[]>();
  for (const row of perGameRes.rows) {
    const pid = row.player_id as string;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid)!.push({
      start_time: row.start_time as string,
      pts: Number(row.pts),
      asts: Number(row.asts),
      stls: Number(row.stls),
      blks: Number(row.blks),
    });
  }

  const recentCutoff = new Date(
    Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const approachingCutoff = new Date(
    Date.now() - APPROACHING_ACTIVE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Per-player most recent game start_time, used to gate "approaching" alerts
  // to currently-active players. We already loaded byPlayer above sorted by
  // start_time ASC, so the last entry is the most recent game.
  const lastPlayed = new Map<string, string>();
  for (const [pid, games] of byPlayer) {
    if (games.length > 0) lastPlayed.set(pid, games[games.length - 1].start_time);
  }

  const alerts: MilestoneAlert[] = [];

  for (const p of lb) {
    const playerActiveRecently =
      (lastPlayed.get(p.id) ?? "") >= approachingCutoff;

    // ── Approaching: within APPROACHING_THRESHOLD of next milestone.
    //    Only surface if the player has played in the last APPROACHING_ACTIVE_DAYS;
    //    otherwise the alert is stale (player hasn't shown up in weeks).
    if (playerActiveRecently) {
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
        if (remaining > 0 && remaining <= APPROACHING_THRESHOLD) {
          alerts.push({
            player_id: p.id,
            player_name: p.name,
            stat: c.stat,
            current: c.value,
            next_milestone: next,
            remaining,
            kind: "approaching",
          });
        }
      }
    }

    // ── Achieved: crossed a milestone in a game within the last N days ──
    const games = byPlayer.get(p.id);
    if (!games || games.length === 0) continue;

    const cumul: Record<MilestoneStat, number> = {
      points: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      games: 0,
    };
    for (const g of games) {
      const deltas: Record<MilestoneStat, number> = {
        points: g.pts,
        assists: g.asts,
        steals: g.stls,
        blocks: g.blks,
        games: 1,
      };
      for (const stat of Object.keys(deltas) as MilestoneStat[]) {
        const before = cumul[stat];
        cumul[stat] += deltas[stat];
        const after = cumul[stat];
        for (const m of MILESTONES[stat]) {
          if (before < m && after >= m && g.start_time >= recentCutoff) {
            alerts.push({
              player_id: p.id,
              player_name: p.name,
              stat,
              current: after,
              next_milestone: m,
              remaining: 0,
              kind: "achieved",
              achieved_at: g.start_time,
            });
          }
        }
      }
    }
  }

  // Achieved first, then approaching. Within each group, highest milestone
  // value on top (a 1000 milestone outranks a 50 milestone). Tiebreak:
  //   - achieved → newest crossing first
  //   - approaching → closest first
  alerts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "achieved" ? -1 : 1;
    if (a.next_milestone !== b.next_milestone) return b.next_milestone - a.next_milestone;
    if (a.kind === "achieved") {
      return (b.achieved_at || "").localeCompare(a.achieved_at || "");
    }
    return a.remaining - b.remaining;
  });
  return alerts;
}

// =======================================================================
// Single-game records (with ties)
// =======================================================================

export async function getSingleGameRecords(): Promise<SingleGameRecord[]> {
  const db = getDb();
  const numberMap = await getGameNumberMap();

  // Read directly from the rollup. ~845 rows for the entire DB versus the
  // ~26K rows the old query touched.
  const result = await db.execute(`
    SELECT pgs.game_id, pgs.player_id, p.name AS player_name, pgs.start_time,
           pgs.points AS pts, pgs.assists AS asts, pgs.steals AS stls, pgs.blocks AS blks,
           pgs.fantasy_points AS fp
    FROM player_game_stats pgs
    JOIN players p ON p.id = pgs.player_id
    WHERE pgs.game_status = 'finished'
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
    fp: Number(row.fp),
  }));

  if (rows.length === 0) return [];

  type Key = "pts" | "asts" | "stls" | "blks" | "fp";

  function pickAll(key: Key, statName: SingleGameStat): SingleGameRecord[] {
    const max = Math.max(...rows.map((r) => r[key]));
    if (max <= 0) return [];
    const ties = rows.filter((r) => r[key] === max);
    ties.sort((a, b) => b.start_time.localeCompare(a.start_time));
    return ties.map((r) => {
      const num = numberMap.get(r.game_id);
      return {
        category: "single_game" as const,
        stat: statName,
        player_id: r.player_id,
        player_name: r.player_name,
        value: r[key],
        game_id: r.game_id,
        start_time: r.start_time,
        game_number: num?.game_number ?? 0,
        season: num?.season ?? 0,
      };
    });
  }

  return [
    ...pickAll("pts", "points"),
    ...pickAll("asts", "assists"),
    ...pickAll("stls", "steals"),
    ...pickAll("blks", "blocks"),
    ...pickAll("fp", "fantasy_points"),
  ];
}

// =======================================================================
// Season records (player totals per season, with ties)
// =======================================================================

export async function getSeasonRecords(): Promise<SeasonRecord[]> {
  const db = getDb();

  // Determine how many seasons exist.
  const cnt = await db.execute(
    "SELECT COUNT(*) AS n FROM games WHERE status = 'finished'"
  );
  const totalGames = Number(cnt.rows[0]?.n ?? 0);
  if (totalGames === 0) return [];
  const { totalSeasons } = getSeasonInfo(totalGames);

  // For each season, build a leaderboard of season totals.
  type Slot = {
    season: number;
    player_id: string;
    player_name: string;
    points: number;
    assists: number;
    steals: number;
    blocks: number;
    fp: number;
    wins: number;
    games: number;
  };
  const slots: Slot[] = [];

  for (let s = 1; s <= totalSeasons; s++) {
    const { gameIds } = await getSeasonGameIds(s);
    if (gameIds.length === 0) continue;
    const lb = await getLeaderboard(gameIds);
    for (const p of lb) {
      slots.push({
        season: s,
        player_id: p.id,
        player_name: p.name,
        points: p.total_points,
        assists: p.assists,
        steals: p.steals,
        blocks: p.blocks,
        fp: p.total_points + p.assists + p.steals + p.blocks,
        wins: p.wins,
        games: p.games_played,
      });
    }
  }

  if (slots.length === 0) return [];

  type Key = "points" | "assists" | "steals" | "blocks" | "fp" | "wins";

  function pickAll(key: Key, statName: SeasonRecordStat): SeasonRecord[] {
    const max = Math.max(...slots.map((s) => s[key]));
    if (max <= 0) return [];
    const ties = slots.filter((s) => s[key] === max);
    // Newest season first when ties exist
    ties.sort((a, b) => b.season - a.season || a.player_name.localeCompare(b.player_name));
    return ties.map((s) => ({
      category: "season" as const,
      stat: statName,
      player_id: s.player_id,
      player_name: s.player_name,
      value: s[key],
      season: s.season,
      games_played: s.games,
    }));
  }

  return [
    ...pickAll("points", "points"),
    ...pickAll("assists", "assists"),
    ...pickAll("steals", "steals"),
    ...pickAll("blocks", "blocks"),
    ...pickAll("fp", "fantasy_points"),
    ...pickAll("wins", "wins"),
  ];
}

// =======================================================================
// Game-level records (margin, comeback) with ties
// =======================================================================

export async function getGameLevelRecords(): Promise<GameRecord[]> {
  const db = getDb();
  const numberMap = await getGameNumberMap();

  // Read straight from the rollup. Each row already has team_score, opp_score,
  // and max_winner_deficit (computed during refreshGameStats), so margin and
  // comeback are immediate. Also pull team + name so we can group rosters per
  // team without a second query.
  const result = await db.execute(`
    SELECT pgs.game_id, pgs.start_time, pgs.team, pgs.team_score, pgs.opp_score,
           pgs.max_winner_deficit, p.name AS player_name,
           CASE WHEN pgs.won = 1 THEN pgs.team ELSE NULL END AS won_team
    FROM player_game_stats pgs
    JOIN players p ON p.id = pgs.player_id
    JOIN games g ON g.id = pgs.game_id
    WHERE pgs.game_status = 'finished' AND g.winning_team IS NOT NULL
  `);

  type GameStat = {
    game_id: string;
    start_time: string;
    winning_team: "A" | "B";
    team_a_players: string[];
    team_b_players: string[];
    final_a: number;
    final_b: number;
    comeback: number;
    margin: number;
  };
  const byGame = new Map<string, GameStat>();
  for (const row of result.rows) {
    const gid = row.game_id as string;
    const team = row.team as "A" | "B";
    if (!byGame.has(gid)) {
      // team_score is *this row's* team's final score; we'll capture both sides
      // as we iterate. Margin is symmetric so |team_score - opp_score| is enough,
      // but to render correctly we need final_a and final_b separately.
      byGame.set(gid, {
        game_id: gid,
        start_time: row.start_time as string,
        winning_team: "A", // placeholder, set below
        team_a_players: [],
        team_b_players: [],
        final_a: 0,
        final_b: 0,
        comeback: Number(row.max_winner_deficit),
        margin: Math.abs(Number(row.team_score) - Number(row.opp_score)),
      });
    }
    const g = byGame.get(gid)!;
    if (team === "A") {
      g.final_a = Number(row.team_score);
      g.team_a_players.push(row.player_name as string);
    } else {
      g.final_b = Number(row.team_score);
      g.team_b_players.push(row.player_name as string);
    }
    if (row.won_team) g.winning_team = row.won_team as "A" | "B";
  }
  const stats = [...byGame.values()];
  if (stats.length === 0) return [];

  function build(stat: GameRecordStat, key: "margin" | "comeback"): GameRecord[] {
    const max = Math.max(...stats.map((s) => s[key]));
    if (max <= 0) return [];
    const ties = stats.filter((s) => s[key] === max);
    ties.sort((a, b) => b.start_time.localeCompare(a.start_time));
    return ties.map((s) => {
      const num = numberMap.get(s.game_id);
      return {
        category: "game" as const,
        stat,
        game_id: s.game_id,
        start_time: s.start_time,
        value: s[key],
        team_a_score: s.final_a,
        team_b_score: s.final_b,
        winning_team: s.winning_team,
        team_a_players: s.team_a_players,
        team_b_players: s.team_b_players,
        game_number: num?.game_number ?? 0,
        season: num?.season ?? 0,
      };
    });
  }

  return [...build("margin", "margin"), ...build("comeback", "comeback")];
}

// =======================================================================
// Streak records (longest W and L streaks ever, with ties)
// =======================================================================

export async function getStreakRecords(): Promise<StreakRecord[]> {
  const db = getDb();
  const numberMap = await getGameNumberMap();
  // Read won/lost outcomes directly from the rollup, ordered for streak walking.
  const result = await db.execute(`
    SELECT pgs.player_id, p.name AS player_name,
           pgs.won, pgs.start_time, pgs.game_id
    FROM player_game_stats pgs
    JOIN players p ON p.id = pgs.player_id
    WHERE pgs.won IS NOT NULL
    ORDER BY pgs.player_id, pgs.start_time ASC, pgs.game_id ASC
  `);

  type Run = {
    player_id: string;
    player_name: string;
    won: boolean;
    length: number;
    start_time: string;
    end_time: string;
    start_game_id: string;
    end_game_id: string;
  };
  const runs: Run[] = [];

  let cur: Run | null = null;
  for (const row of result.rows) {
    const pid = row.player_id as string;
    const name = row.player_name as string;
    const won = Number(row.won) === 1;
    const t = row.start_time as string;
    const gid = row.game_id as string;

    if (cur && cur.player_id === pid && cur.won === won) {
      cur.length += 1;
      cur.end_time = t;
      cur.end_game_id = gid;
    } else {
      if (cur) runs.push(cur);
      cur = {
        player_id: pid,
        player_name: name,
        won,
        length: 1,
        start_time: t,
        end_time: t,
        start_game_id: gid,
        end_game_id: gid,
      };
    }
  }
  if (cur) runs.push(cur);

  if (runs.length === 0) return [];

  function pick(stat: StreakKind, won: boolean): StreakRecord[] {
    const filtered = runs.filter((r) => r.won === won);
    if (filtered.length === 0) return [];
    const max = Math.max(...filtered.map((r) => r.length));
    if (max <= 1) return []; // streak of 1 is trivial
    const ties = filtered.filter((r) => r.length === max);
    ties.sort((a, b) => b.end_time.localeCompare(a.end_time));
    return ties.map((r) => {
      const start = numberMap.get(r.start_game_id);
      const end = numberMap.get(r.end_game_id);
      return {
        category: "streak" as const,
        stat,
        player_id: r.player_id,
        player_name: r.player_name,
        value: r.length,
        start_time: r.start_time,
        end_time: r.end_time,
        start_game_id: r.start_game_id,
        end_game_id: r.end_game_id,
        start_game_number: start?.game_number ?? 0,
        end_game_number: end?.game_number ?? 0,
        start_season: start?.season ?? 0,
        end_season: end?.season ?? 0,
      };
    });
  }

  return [...pick("win_streak", true), ...pick("loss_streak", false)];
}

// =======================================================================
// Aggregate
// =======================================================================

async function _getAllRecords(): Promise<RecordsBundle> {
  const [single_game, season, game, streak, milestones] = await Promise.all([
    getSingleGameRecords(),
    getSeasonRecords(),
    getGameLevelRecords(),
    getStreakRecords(),
    getMilestoneWatch(),
  ]);
  return { single_game, season, game, streak, milestones };
}

// Cached: full records bundle held until any stats-affecting write busts TAG_STATS.
export const getAllRecords = unstable_cache(
  _getAllRecords,
  ["getAllRecords"],
  { tags: [TAG_STATS], revalidate: 86400 },
);
