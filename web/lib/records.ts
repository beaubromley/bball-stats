import { getDb } from "./turso";
import { getLeaderboard, getSeasonGameIds } from "./stats";
import { getSeasonInfo, getSeasonForGameNumber } from "./seasons";

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

function nextMilestone(value: number, list: number[]): number | null {
  for (const m of list) if (value < m) return m;
  return null;
}

export async function getMilestoneWatch(): Promise<MilestoneAlert[]> {
  const db = getDb();
  const lb = await getLeaderboard();

  // Per-player per-game stat deltas (chronological) so we can detect when a
  // player crossed each milestone and surface "just achieved" alerts.
  const perGameRes = await db.execute(`
    SELECT
      r.player_id,
      g.start_time,
      g.id AS game_id,
      COALESCE(SUM(CASE WHEN ge.event_type IN ('score','correction') THEN ge.point_value ELSE 0 END), 0) AS pts,
      COALESCE(SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END), 0) AS asts,
      COALESCE(SUM(CASE WHEN ge.event_type = 'steal'  THEN 1 ELSE 0 END), 0) AS stls,
      COALESCE(SUM(CASE WHEN ge.event_type = 'block'  THEN 1 ELSE 0 END), 0) AS blks
    FROM rosters r
    JOIN games g ON g.id = r.game_id AND g.status = 'finished'
    LEFT JOIN game_events ge ON ge.game_id = r.game_id AND ge.player_id = r.player_id
    GROUP BY r.player_id, g.id, g.start_time
    ORDER BY r.player_id, g.start_time ASC, g.id ASC
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

  const alerts: MilestoneAlert[] = [];

  for (const p of lb) {
    // ── Approaching: within APPROACHING_THRESHOLD of next milestone ──
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

  // Achieved first (newest crossing first), then approaching (closest first).
  alerts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "achieved" ? -1 : 1;
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

  // Pull every score AND correction event for finished, decided games.
  // We need both because:
  //   1. Scores that were later undone shouldn't count toward final score
  //      OR toward the running total used for comeback peaks. (Otherwise
  //      Team A might transiently appear up 11–6 before dropping back to
  //      10–6, and that phantom 5-point "deficit" would get counted as a
  //      comeback for Team B.)
  //   2. We can't just rely on corrected_event_id pointing at the right
  //      score id — older client builds wrote the row index instead of
  //      the DB id, leaving 4 corrections with non-resolvable ids. So we
  //      do a two-pass match: trust corrected_event_id when it lands on
  //      a real score, then fall back to (player, opposite pv, earlier
  //      created_at) for the rest.
  const scoresResult = await db.execute(`
    SELECT
      ge.id,
      ge.game_id,
      ge.player_id,
      ge.point_value,
      ge.created_at,
      r.team
    FROM game_events ge
    JOIN rosters r ON r.game_id = ge.game_id AND r.player_id = ge.player_id
    JOIN games g ON g.id = ge.game_id
    WHERE g.status = 'finished'
      AND g.winning_team IS NOT NULL
      AND ge.event_type = 'score'
    ORDER BY ge.game_id, ge.created_at ASC, ge.id ASC
  `);

  const correctionsResult = await db.execute(`
    SELECT
      ge.id,
      ge.game_id,
      ge.player_id,
      ge.point_value,
      ge.corrected_event_id,
      ge.created_at
    FROM game_events ge
    JOIN games g ON g.id = ge.game_id
    WHERE g.status = 'finished'
      AND g.winning_team IS NOT NULL
      AND ge.event_type = 'correction'
    ORDER BY ge.game_id, ge.created_at ASC, ge.id ASC
  `);

  // Game metadata (rosters + winning team + start time)
  const gamesResult = await db.execute(`
    SELECT
      g.id,
      g.start_time,
      g.winning_team,
      GROUP_CONCAT(CASE WHEN r.team = 'A' THEN p.name END) AS team_a_players,
      GROUP_CONCAT(CASE WHEN r.team = 'B' THEN p.name END) AS team_b_players
    FROM games g
    JOIN rosters r ON r.game_id = g.id
    JOIN players p ON p.id = r.player_id
    WHERE g.status = 'finished' AND g.winning_team IS NOT NULL
    GROUP BY g.id
  `);

  type Meta = {
    game_id: string;
    start_time: string;
    winning_team: "A" | "B";
    team_a_players: string[];
    team_b_players: string[];
  };
  const meta = new Map<string, Meta>();
  for (const row of gamesResult.rows) {
    meta.set(row.id as string, {
      game_id: row.id as string,
      start_time: row.start_time as string,
      winning_team: row.winning_team as "A" | "B",
      team_a_players: row.team_a_players ? String(row.team_a_players).split(",") : [],
      team_b_players: row.team_b_players ? String(row.team_b_players).split(",") : [],
    });
  }

  // Walk events per game, computing final scores + max deficit faced by winner.
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
  type ScoreEvent = {
    id: number;
    player_id: string;
    pv: number;
    created_at: string;
    team: "A" | "B";
  };
  type Correction = {
    id: number;
    player_id: string;
    pv: number;
    corrected_event_id: number | null;
    created_at: string;
  };

  const scoresByGame = new Map<string, ScoreEvent[]>();
  for (const row of scoresResult.rows) {
    const gid = row.game_id as string;
    if (!scoresByGame.has(gid)) scoresByGame.set(gid, []);
    scoresByGame.get(gid)!.push({
      id: Number(row.id),
      player_id: row.player_id as string,
      pv: Number(row.point_value),
      created_at: row.created_at as string,
      team: row.team as "A" | "B",
    });
  }

  const correctionsByGame = new Map<string, Correction[]>();
  for (const row of correctionsResult.rows) {
    const gid = row.game_id as string;
    if (!correctionsByGame.has(gid)) correctionsByGame.set(gid, []);
    correctionsByGame.get(gid)!.push({
      id: Number(row.id),
      player_id: row.player_id as string,
      pv: Number(row.point_value),
      corrected_event_id:
        row.corrected_event_id !== null && row.corrected_event_id !== undefined
          ? Number(row.corrected_event_id)
          : null,
      created_at: row.created_at as string,
    });
  }

  // Build set of undone score IDs per game.
  // Pass 1: trust corrected_event_id when it resolves to a real score in this game.
  // Pass 2: heuristic — match leftover corrections to most recent unmatched score
  //         by same player + opposite point value + earlier timestamp.
  function computeUndoneIds(
    scores: ScoreEvent[],
    corrections: Correction[]
  ): Set<number> {
    const undone = new Set<number>();
    const scoreIds = new Set(scores.map((s) => s.id));
    const remaining: Correction[] = [];
    for (const c of corrections) {
      if (
        c.corrected_event_id !== null &&
        scoreIds.has(c.corrected_event_id) &&
        !undone.has(c.corrected_event_id)
      ) {
        undone.add(c.corrected_event_id);
      } else {
        remaining.push(c);
      }
    }
    for (const c of remaining) {
      const candidates = scores
        .filter(
          (s) =>
            s.player_id === c.player_id &&
            s.pv === -c.pv &&
            s.created_at < c.created_at &&
            !undone.has(s.id)
        )
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) || b.id - a.id
        );
      if (candidates.length > 0) {
        undone.add(candidates[0].id);
      }
      // Otherwise the data is too inconsistent to recover; drop the correction.
    }
    return undone;
  }

  const stats: GameStat[] = [];
  for (const [gid, scores] of scoresByGame) {
    const m = meta.get(gid);
    if (!m) continue;
    const corrections = correctionsByGame.get(gid) ?? [];
    const undone = computeUndoneIds(scores, corrections);

    let a = 0;
    let b = 0;
    let maxDef = 0;
    for (const e of scores) {
      if (undone.has(e.id)) continue;
      if (e.team === "A") a += e.pv;
      else b += e.pv;
      const winner = m.winning_team === "A" ? a : b;
      const loser = m.winning_team === "A" ? b : a;
      const def = loser - winner;
      if (def > maxDef) maxDef = def;
    }
    stats.push({
      game_id: gid,
      start_time: m.start_time,
      winning_team: m.winning_team,
      team_a_players: m.team_a_players,
      team_b_players: m.team_b_players,
      final_a: a,
      final_b: b,
      comeback: maxDef,
      margin: Math.abs(a - b),
    });
  }

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
  const result = await db.execute(`
    SELECT
      r.player_id,
      p.name AS player_name,
      r.team,
      r.game_id,
      g.winning_team,
      g.start_time
    FROM rosters r
    JOIN players p ON p.id = r.player_id
    JOIN games g ON g.id = r.game_id
    WHERE g.status = 'finished' AND g.winning_team IS NOT NULL
    ORDER BY r.player_id, g.start_time ASC
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
    const won = row.team === row.winning_team;
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

export async function getAllRecords(): Promise<RecordsBundle> {
  const [single_game, season, game, streak, milestones] = await Promise.all([
    getSingleGameRecords(),
    getSeasonRecords(),
    getGameLevelRecords(),
    getStreakRecords(),
    getMilestoneWatch(),
  ]);
  return { single_game, season, game, streak, milestones };
}
