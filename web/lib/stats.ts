import { unstable_cache } from "next/cache";
import { getDb } from "./turso";
import { calculateFantasyPoints } from "./fantasy";
import { getGameRangeForSeason, getSeasonInfo } from "./seasons";
import { TAG_STATS } from "./cache-tags";

export interface PlayerStats {
  id: string;
  name: string;
  games_played: number;
  effective_games: number;  // normalized game-to-11 equivalent
  wins: number;
  losses: number;
  win_pct: number;
  total_points: number;
  ppg: number;  // normalized to game-to-11
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  plus_minus: number;
  plus_minus_per_game: number;  // normalized to game-to-11
  streak: string; // e.g. "W3", "L2"
  mvp_count: number;
  // Normalized per-game fields (game-to-11)
  apg: number;
  spg: number;
  bpg: number;
  fpg: number;
  ones_pg: number;
  twos_pg: number;
}

export interface SeasonMeta {
  totalGames: number;
  totalSeasons: number;
  currentSeason: number;
  gamesInSeason: number;
}

async function _getSeasonGameIds(season: number): Promise<{ gameIds: string[]; meta: SeasonMeta }> {
  const db = getDb();
  const result = await db.execute(
    "SELECT id FROM games WHERE status = 'finished' ORDER BY start_time ASC"
  );
  const allIds = result.rows.map((r) => r.id as string);
  const totalGames = allIds.length;
  const { currentSeason, totalSeasons } = getSeasonInfo(totalGames);
  const { startGame, endGame } = getGameRangeForSeason(season);
  const seasonIds = allIds.slice(startGame - 1, Math.min(endGame, totalGames));

  return {
    gameIds: seasonIds,
    meta: { totalGames, totalSeasons, currentSeason, gamesInSeason: seasonIds.length },
  };
}

// Cached: held forever (1-day safety net) until any game record / event /
// roster change calls revalidateTag(TAG_STATS).
export const getSeasonGameIds = unstable_cache(
  _getSeasonGameIds,
  ["getSeasonGameIds"],
  { tags: [TAG_STATS], revalidate: 86400 },
);

async function _getLeaderboard(gameIds?: string[]): Promise<PlayerStats[]> {
  const db = getDb();

  // If filtering to an empty set of games, return empty
  if (gameIds && gameIds.length === 0) return [];

  const filtering = gameIds && gameIds.length > 0;
  const ph = filtering ? gameIds.map(() => "?").join(",") : "";

  // Read directly from the player_game_stats rollup. Two queries instead of
  // four, both small (one row per (game,player), ~845 rows total). The math
  // matches the old game_events-based queries exactly because refreshGameStats
  // and the backfill use the same per-game logic.
  //
  // Plus/minus is filtered to finished games only (matches old behavior of
  // the previous +/- query, which JOINed `g.status='finished'`). `won` is
  // NULL on active games so wins/losses naturally exclude them.

  const mainSql = `
    SELECT
      p.id,
      p.name,
      COUNT(*) AS games_played,
      COALESCE(SUM(pgs.effective_games), 0) AS effective_games,
      COALESCE(SUM(CASE WHEN pgs.won = 1 THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN pgs.won = 0 THEN 1 ELSE 0 END), 0) AS losses,
      COALESCE(SUM(pgs.points), 0) AS total_points,
      COALESCE(SUM(pgs.ones_made), 0) AS ones_made,
      COALESCE(SUM(pgs.twos_made), 0) AS twos_made,
      COALESCE(SUM(pgs.assists), 0) AS assists,
      COALESCE(SUM(pgs.steals), 0) AS steals,
      COALESCE(SUM(pgs.blocks), 0) AS blocks,
      COALESCE(SUM(CASE WHEN pgs.game_status = 'finished' THEN pgs.plus_minus ELSE 0 END), 0) AS plus_minus,
      COALESCE(SUM(pgs.was_game_mvp), 0) AS mvp_count
    FROM player_game_stats pgs
    JOIN players p ON p.id = pgs.player_id
    ${filtering ? `WHERE pgs.game_id IN (${ph})` : ""}
    GROUP BY p.id
    ORDER BY wins DESC, total_points DESC
  `;
  const mainArgs: string[] = filtering ? [...gameIds] : [];

  const streakSql = `
    SELECT player_id, won, start_time
    FROM player_game_stats
    WHERE won IS NOT NULL ${filtering ? `AND game_id IN (${ph})` : ""}
    ORDER BY start_time DESC, game_id DESC
  `;
  const streakArgs: string[] = filtering ? [...gameIds] : [];

  const [result, streakResult] = await Promise.all([
    db.execute({ sql: mainSql, args: mainArgs }),
    db.execute({ sql: streakSql, args: streakArgs }),
  ]);

  // Build streak strings ("W3" / "L2" / "-") from the ordered won/lost sequence.
  // Note: each (player, game) pair has its own row, so iterating in returned
  // order gives us the player's W/L history in chronological-reverse order.
  const playerGames = new Map<string, boolean[]>();
  for (const row of streakResult.rows) {
    const pid = row.player_id as string;
    const won = Number(row.won) === 1;
    if (!playerGames.has(pid)) playerGames.set(pid, []);
    playerGames.get(pid)!.push(won);
  }
  const streakMap = new Map<string, string>();
  for (const [pid, games] of playerGames) {
    if (games.length === 0) { streakMap.set(pid, "-"); continue; }
    const first = games[0];
    let count = 1;
    for (let i = 1; i < games.length; i++) {
      if (games[i] === first) count++;
      else break;
    }
    streakMap.set(pid, `${first ? "W" : "L"}${count}`);
  }

  // pmMap and mvpCountMap kept as Maps for parity with the old code path —
  // values are now read straight from the main query.
  const pmMap = new Map<string, number>();
  const mvpCountMap = new Map<string, number>();
  for (const row of result.rows) {
    pmMap.set(row.id as string, Number(row.plus_minus));
    mvpCountMap.set(row.id as string, Number(row.mvp_count));
  }

  const r1 = (n: number) => Math.round(n * 10) / 10;

  return result.rows.map((row) => {
    const gamesPlayed = Number(row.games_played) || 1;
    const effectiveGames = Number(row.effective_games) || 1;
    const totalPoints = Number(row.total_points);
    const onesMade = Number(row.ones_made);
    const twosMade = Number(row.twos_made);
    const assists = Number(row.assists);
    const steals = Number(row.steals);
    const blocks = Number(row.blocks);
    const pm = pmMap.get(row.id as string) || 0;
    return {
      id: row.id as string,
      name: row.name as string,
      games_played: Number(row.games_played),
      effective_games: effectiveGames,
      wins: Number(row.wins),
      losses: Number(row.losses),
      win_pct: Math.round((Number(row.wins) / gamesPlayed) * 100),
      total_points: totalPoints,
      ppg: r1(totalPoints / effectiveGames),
      ones_made: onesMade,
      twos_made: twosMade,
      assists,
      steals,
      blocks,
      fantasy_points: calculateFantasyPoints({ points: totalPoints, assists, steals, blocks }),
      plus_minus: pm,
      plus_minus_per_game: r1(pm / effectiveGames),
      streak: streakMap.get(row.id as string) || "-",
      mvp_count: mvpCountMap.get(row.id as string) || 0,
      apg: r1(assists / effectiveGames),
      spg: r1(steals / effectiveGames),
      bpg: r1(blocks / effectiveGames),
      fpg: r1((totalPoints + assists + steals + blocks) / effectiveGames),
      ones_pg: r1(onesMade / effectiveGames),
      twos_pg: r1(twosMade / effectiveGames),
    };
  });
}

// Cached: leaderboard results held until a game/roster/event change triggers
// revalidateTag(TAG_STATS). Different gameIds get different cache entries.
export const getLeaderboard = unstable_cache(
  _getLeaderboard,
  ["getLeaderboard"],
  { tags: [TAG_STATS], revalidate: 86400 },
);

export interface TodayStats {
  games_today: number;
  players: PlayerStats[];
}

async function _getTodayStats(dateStr: string): Promise<TodayStats> {
  const db = getDb();

  // First: how many games started today (Central time). Cheap — uses games table directly.
  const countResult = await db.execute({
    sql: "SELECT COUNT(DISTINCT id) as cnt FROM games WHERE date(start_time, '-6 hours') = ?",
    args: [dateStr],
  });
  const games_today = Number(countResult.rows[0]?.cnt ?? 0);
  if (games_today === 0) return { games_today: 0, players: [] };

  // Now read the rollup, filtering by today (start_time is denormalized on each row).
  const result = await db.execute({
    sql: `
      SELECT
        p.id,
        p.name,
        COUNT(*) AS games_played,
        COALESCE(SUM(pgs.effective_games), 0) AS effective_games,
        COALESCE(SUM(CASE WHEN pgs.won = 1 THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN pgs.won = 0 THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(pgs.points), 0) AS total_points,
        COALESCE(SUM(pgs.ones_made), 0) AS ones_made,
        COALESCE(SUM(pgs.twos_made), 0) AS twos_made,
        COALESCE(SUM(pgs.assists), 0) AS assists,
        COALESCE(SUM(pgs.steals), 0) AS steals,
        COALESCE(SUM(pgs.blocks), 0) AS blocks,
        COALESCE(SUM(CASE WHEN pgs.game_status = 'finished' THEN pgs.plus_minus ELSE 0 END), 0) AS plus_minus
      FROM player_game_stats pgs
      JOIN players p ON p.id = pgs.player_id
      WHERE date(pgs.start_time, '-6 hours') = ?
      GROUP BY p.id
      ORDER BY total_points DESC
    `,
    args: [dateStr],
  });

  const r1 = (n: number) => Math.round(n * 10) / 10;

  const players: PlayerStats[] = result.rows.map((row) => {
    const gamesPlayed = Number(row.games_played) || 1;
    const effectiveGames = Number(row.effective_games) || 1;
    const totalPoints = Number(row.total_points);
    const onesMade = Number(row.ones_made);
    const twosMade = Number(row.twos_made);
    const assists = Number(row.assists);
    const steals = Number(row.steals);
    const blocks = Number(row.blocks);
    const pm = Number(row.plus_minus);
    return {
      id: row.id as string,
      name: row.name as string,
      games_played: Number(row.games_played),
      effective_games: effectiveGames,
      wins: Number(row.wins),
      losses: Number(row.losses),
      win_pct: Math.round((Number(row.wins) / gamesPlayed) * 100),
      total_points: totalPoints,
      ppg: r1(totalPoints / effectiveGames),
      ones_made: onesMade,
      twos_made: twosMade,
      assists,
      steals,
      blocks,
      fantasy_points: calculateFantasyPoints({ points: totalPoints, assists, steals, blocks }),
      plus_minus: pm,
      plus_minus_per_game: r1(pm / effectiveGames),
      streak: "-",
      mvp_count: 0,
      apg: r1(assists / effectiveGames),
      spg: r1(steals / effectiveGames),
      bpg: r1(blocks / effectiveGames),
      fpg: r1((totalPoints + assists + steals + blocks) / effectiveGames),
      ones_pg: r1(onesMade / effectiveGames),
      twos_pg: r1(twosMade / effectiveGames),
    };
  });

  return { games_today, players };
}

export const getTodayStats = unstable_cache(
  _getTodayStats,
  ["getTodayStats"],
  { tags: [TAG_STATS], revalidate: 86400 },
);

export async function getPlayerStats(playerId: string): Promise<PlayerStats | null> {
  const leaderboard = await getLeaderboard();
  return leaderboard.find((p) => p.id === playerId) ?? null;
}

export interface BoxScorePlayer {
  player_id: string;
  player_name: string;
  team: "A" | "B";
  points: number;
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  is_mvp: boolean;
}

export interface BoxScoreResult {
  game_id: string;
  status: string;
  winning_team: string | null;
  team_a_score: number;
  team_b_score: number;
  players: BoxScorePlayer[];
  mvp: BoxScorePlayer | null;
}

export async function getBoxScore(gameId: string): Promise<BoxScoreResult | null> {
  const db = getDb();

  const gameResult = await db.execute({
    sql: "SELECT id, status, winning_team FROM games WHERE id = ?",
    args: [gameId],
  });
  if (gameResult.rows.length === 0) return null;
  const game = gameResult.rows[0];

  const result = await db.execute({
    sql: `
      SELECT
        r.player_id,
        p.name as player_name,
        r.team,
        COALESCE(SUM(CASE WHEN ge.event_type IN ('score', 'correction') THEN ge.point_value ELSE 0 END), 0) as points,
        COALESCE(SUM(CASE WHEN ge.event_type = 'score' AND ge.point_value = 1 THEN 1 ELSE 0 END)
          - SUM(CASE WHEN ge.event_type = 'correction' AND ge.point_value = -1 THEN 1 ELSE 0 END), 0) as ones_made,
        COALESCE(SUM(CASE WHEN ge.event_type = 'score' AND ge.point_value = 2 THEN 1 ELSE 0 END)
          - SUM(CASE WHEN ge.event_type = 'correction' AND ge.point_value = -2 THEN 1 ELSE 0 END), 0) as twos_made,
        COALESCE(SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END), 0) as assists,
        COALESCE(SUM(CASE WHEN ge.event_type = 'steal' THEN 1 ELSE 0 END), 0) as steals,
        COALESCE(SUM(CASE WHEN ge.event_type = 'block' THEN 1 ELSE 0 END), 0) as blocks
      FROM rosters r
      JOIN players p ON r.player_id = p.id
      LEFT JOIN game_events ge ON ge.game_id = r.game_id AND ge.player_id = r.player_id
      WHERE r.game_id = ?
      GROUP BY r.player_id, p.name, r.team
      ORDER BY r.team, points DESC
    `,
    args: [gameId],
  });

  const players: BoxScorePlayer[] = result.rows.map((row) => {
    const points = Number(row.points);
    const assists = Number(row.assists);
    const steals = Number(row.steals);
    const blocks = Number(row.blocks);
    return {
      player_id: row.player_id as string,
      player_name: row.player_name as string,
      team: row.team as "A" | "B",
      points,
      ones_made: Number(row.ones_made),
      twos_made: Number(row.twos_made),
      assists,
      steals,
      blocks,
      fantasy_points: calculateFantasyPoints({ points, assists, steals, blocks }),
      is_mvp: false,
    };
  });

  const teamAScore = players.filter((p) => p.team === "A").reduce((s, p) => s + p.points, 0);
  const teamBScore = players.filter((p) => p.team === "B").reduce((s, p) => s + p.points, 0);

  // MVP: highest fantasy points on the winning team
  // Deterministic tiebreaker: fp DESC, points DESC, assists DESC, player_id ASC
  let mvp: BoxScorePlayer | null = null;
  const winningTeam = game.winning_team as string | null;
  if (winningTeam) {
    const winningPlayers = players.filter((p) => p.team === winningTeam);
    mvp = winningPlayers.reduce<BoxScorePlayer | null>((best, p) => {
      if (!best) return p;
      if (p.fantasy_points !== best.fantasy_points) return p.fantasy_points > best.fantasy_points ? p : best;
      if (p.points !== best.points) return p.points > best.points ? p : best;
      if (p.assists !== best.assists) return p.assists > best.assists ? p : best;
      return p.player_id < best.player_id ? p : best;
    }, null);
    if (mvp) {
      const idx = players.findIndex((p) => p.player_id === mvp!.player_id);
      if (idx >= 0) players[idx].is_mvp = true;
    }
  }

  return {
    game_id: gameId,
    status: game.status as string,
    winning_team: winningTeam,
    team_a_score: teamAScore,
    team_b_score: teamBScore,
    players,
    mvp,
  };
}

export interface GameHistoryMvp {
  player_id: string;
  player_name: string;
  points: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
}

export async function getGameHistory() {
  const db = getDb();

  const result = await db.execute(`
      SELECT
        g.id,
        g.location,
        g.start_time,
        g.end_time,
        g.status,
        g.winning_team,
        GROUP_CONCAT(CASE WHEN r.team = 'A' THEN p.name END) as team_a_players,
        GROUP_CONCAT(CASE WHEN r.team = 'B' THEN p.name END) as team_b_players,
        COALESCE(sa.score, 0) as team_a_score,
        COALESCE(sb.score, 0) as team_b_score
      FROM games g
      LEFT JOIN rosters r ON g.id = r.game_id
      LEFT JOIN players p ON r.player_id = p.id
      LEFT JOIN (
        SELECT ge.game_id, SUM(ge.point_value) as score
        FROM game_events ge
        JOIN rosters r2 ON ge.game_id = r2.game_id AND ge.player_id = r2.player_id AND r2.team = 'A'
        GROUP BY ge.game_id
      ) sa ON g.id = sa.game_id
      LEFT JOIN (
        SELECT ge.game_id, SUM(ge.point_value) as score
        FROM game_events ge
        JOIN rosters r2 ON ge.game_id = r2.game_id AND ge.player_id = r2.player_id AND r2.team = 'B'
        GROUP BY ge.game_id
      ) sb ON g.id = sb.game_id
      GROUP BY g.id
      ORDER BY g.start_time DESC
  `);

  // Second query: MVP per finished game. MVP = highest fantasy points on the
  // winning team with deterministic tiebreakers (fp, pts, asts, player_id).
  const mvpResult = await db.execute(`
    WITH player_stats AS (
      SELECT
        r.game_id,
        r.player_id,
        p.name AS player_name,
        r.team,
        COALESCE(SUM(CASE WHEN ge.event_type IN ('score','correction') THEN ge.point_value ELSE 0 END), 0) AS points,
        COALESCE(SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END), 0) AS assists,
        COALESCE(SUM(CASE WHEN ge.event_type = 'steal'  THEN 1 ELSE 0 END), 0) AS steals,
        COALESCE(SUM(CASE WHEN ge.event_type = 'block'  THEN 1 ELSE 0 END), 0) AS blocks
      FROM rosters r
      JOIN players p ON p.id = r.player_id
      LEFT JOIN game_events ge ON ge.game_id = r.game_id AND ge.player_id = r.player_id
      GROUP BY r.game_id, r.player_id, p.name, r.team
    ),
    ranked AS (
      SELECT
        ps.*,
        (ps.points + ps.assists + ps.steals + ps.blocks) AS fp,
        ROW_NUMBER() OVER (
          PARTITION BY ps.game_id
          ORDER BY
            (ps.points + ps.assists + ps.steals + ps.blocks) DESC,
            ps.points DESC,
            ps.assists DESC,
            ps.player_id ASC
        ) AS rn
      FROM player_stats ps
      JOIN games g ON g.id = ps.game_id
      WHERE g.status = 'finished'
        AND g.winning_team IS NOT NULL
        AND ps.team = g.winning_team
    )
    SELECT game_id, player_id, player_name, points, assists, steals, blocks, fp
    FROM ranked WHERE rn = 1
  `);

  const mvpMap = new Map<string, GameHistoryMvp>();
  for (const row of mvpResult.rows) {
    mvpMap.set(row.game_id as string, {
      player_id: row.player_id as string,
      player_name: row.player_name as string,
      points: Number(row.points),
      assists: Number(row.assists),
      steals: Number(row.steals),
      blocks: Number(row.blocks),
      fantasy_points: Number(row.fp),
    });
  }

  // Games are returned DESC — compute game_number (1 = oldest)
  const totalGames = result.rows.length;
  return result.rows.map((row, i) => ({
    id: row.id,
    location: row.location,
    start_time: row.start_time,
    end_time: row.end_time,
    status: row.status,
    winning_team: row.winning_team,
    team_a_players: row.team_a_players
      ? String(row.team_a_players).split(",")
      : [],
    team_b_players: row.team_b_players
      ? String(row.team_b_players).split(",")
      : [],
    team_a_score: Number(row.team_a_score),
    team_b_score: Number(row.team_b_score),
    game_number: totalGames - i,
    mvp: mvpMap.get(row.id as string) ?? null,
  }));
}

export async function getGameNumber(gameId: string): Promise<number | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT COUNT(*) as num FROM games WHERE start_time <= (SELECT start_time FROM games WHERE id = ?)",
    args: [gameId],
  });
  const num = Number(result.rows[0]?.num);
  return num > 0 ? num : null;
}
