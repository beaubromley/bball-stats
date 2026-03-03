import { getDb } from "./turso";
import { calculateFantasyPoints } from "./fantasy";
import { getGameRangeForSeason, getSeasonInfo } from "./seasons";

export interface PlayerStats {
  id: string;
  name: string;
  games_played: number;
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

export async function getSeasonGameIds(season: number): Promise<{ gameIds: string[]; meta: SeasonMeta }> {
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

export async function getLeaderboard(gameIds?: string[]): Promise<PlayerStats[]> {
  const db = getDb();

  // If filtering to an empty set of games, return empty
  if (gameIds && gameIds.length === 0) return [];

  const filtering = gameIds && gameIds.length > 0;
  const ph = filtering ? gameIds.map(() => "?").join(",") : "";
  const gameClause = filtering ? `AND g.id IN (${ph})` : "";
  const eventClause = filtering ? `WHERE ge.game_id IN (${ph})` : "";

  // Effective games subquery: game-to-22 counts as 2 effective games, game-to-11 counts as 1
  const egGameClause = filtering ? `AND g_eg.id IN (${ph})` : "";
  const egEventClause = filtering ? `WHERE ge2.game_id IN (${ph})` : "";

  const mainArgs: string[] = [];
  if (filtering) mainArgs.push(...gameIds); // for gameClause
  if (filtering) mainArgs.push(...gameIds); // for eventClause (scoring)
  if (filtering) mainArgs.push(...gameIds); // for egGameClause
  if (filtering) mainArgs.push(...gameIds); // for egEventClause (inside gws)

  const result = await db.execute({
    sql: `
      SELECT
        p.id,
        p.name,
        COUNT(DISTINCT r.game_id) as games_played,
        COALESCE(SUM(CASE
          WHEN g.status = 'finished' AND g.winning_team = r.team THEN 1
          ELSE 0
        END), 0) as wins,
        COALESCE(SUM(CASE
          WHEN g.status = 'finished' AND g.winning_team IS NOT NULL AND g.winning_team != r.team THEN 1
          ELSE 0
        END), 0) as losses,
        COALESCE(scoring.total_points, 0) as total_points,
        COALESCE(scoring.ones_made, 0) as ones_made,
        COALESCE(scoring.twos_made, 0) as twos_made,
        COALESCE(scoring.assists, 0) as assists,
        COALESCE(scoring.steals, 0) as steals,
        COALESCE(scoring.blocks, 0) as blocks,
        COALESCE(eg.effective_games, 1.0) as effective_games
      FROM players p
      JOIN rosters r ON p.id = r.player_id
      JOIN games g ON r.game_id = g.id ${gameClause}
      LEFT JOIN (
        SELECT
          ge.player_id,
          SUM(ge.point_value) as total_points,
          SUM(CASE WHEN ge.event_type = 'score' AND ge.point_value = 1 THEN 1 ELSE 0 END)
            - SUM(CASE WHEN ge.event_type = 'correction' AND ge.point_value = -1 THEN 1 ELSE 0 END) as ones_made,
          SUM(CASE WHEN ge.event_type = 'score' AND ge.point_value = 2 THEN 1 ELSE 0 END)
            - SUM(CASE WHEN ge.event_type = 'correction' AND ge.point_value = -2 THEN 1 ELSE 0 END) as twos_made,
          SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END) as assists,
          SUM(CASE WHEN ge.event_type = 'steal' THEN 1 ELSE 0 END) as steals,
          SUM(CASE WHEN ge.event_type = 'block' THEN 1 ELSE 0 END) as blocks
        FROM game_events ge
        ${eventClause}
        GROUP BY ge.player_id
      ) scoring ON p.id = scoring.player_id
      LEFT JOIN (
        SELECT r_eg.player_id, SUM(COALESCE(gws.winning_score, 11) / 11.0) as effective_games
        FROM rosters r_eg
        JOIN games g_eg ON r_eg.game_id = g_eg.id AND g_eg.status = 'finished' ${egGameClause}
        LEFT JOIN (
          SELECT ts.game_id, MAX(ts.team_score) as winning_score
          FROM (
            SELECT r2.game_id, r2.team, SUM(ge2.point_value) as team_score
            FROM game_events ge2
            JOIN rosters r2 ON ge2.game_id = r2.game_id AND ge2.player_id = r2.player_id
            ${egEventClause}
            GROUP BY r2.game_id, r2.team
          ) ts
          GROUP BY ts.game_id
        ) gws ON r_eg.game_id = gws.game_id
        GROUP BY r_eg.player_id
      ) eg ON p.id = eg.player_id
      GROUP BY p.id
      ORDER BY wins DESC, total_points DESC
    `,
    args: mainArgs,
  });

  // Compute raw +/- per player
  const pmArgs: string[] = filtering ? [...gameIds] : [];
  const pmGameClause = filtering ? `AND g.id IN (${ph})` : "";
  const pmResult = await db.execute({
    sql: `
      SELECT
        r.player_id,
        SUM(
          CASE WHEN r.team = 'A' THEN COALESCE(sa.score, 0) - COALESCE(sb.score, 0)
               ELSE COALESCE(sb.score, 0) - COALESCE(sa.score, 0)
          END
        ) as plus_minus
      FROM rosters r
      JOIN games g ON r.game_id = g.id AND g.status = 'finished' ${pmGameClause}
      LEFT JOIN (
        SELECT ge.game_id, SUM(ge.point_value) as score
        FROM game_events ge
        JOIN rosters r2 ON ge.game_id = r2.game_id AND ge.player_id = r2.player_id AND r2.team = 'A'
        GROUP BY ge.game_id
      ) sa ON r.game_id = sa.game_id
      LEFT JOIN (
        SELECT ge.game_id, SUM(ge.point_value) as score
        FROM game_events ge
        JOIN rosters r2 ON ge.game_id = r2.game_id AND ge.player_id = r2.player_id AND r2.team = 'B'
        GROUP BY ge.game_id
      ) sb ON r.game_id = sb.game_id
      GROUP BY r.player_id
    `,
    args: pmArgs,
  });
  const pmMap = new Map<string, number>();
  for (const row of pmResult.rows) {
    pmMap.set(row.player_id as string, Number(row.plus_minus));
  }

  // Compute win/loss streaks
  const streakArgs: string[] = filtering ? [...gameIds] : [];
  const streakGameClause = filtering ? `AND g.id IN (${ph})` : "";
  const streakResult = await db.execute({
    sql: `
      SELECT r.player_id, g.winning_team, r.team, g.start_time
      FROM rosters r
      JOIN games g ON r.game_id = g.id
      WHERE g.status = 'finished' AND g.winning_team IS NOT NULL ${streakGameClause}
      ORDER BY g.start_time DESC
    `,
    args: streakArgs,
  });
  const playerGames = new Map<string, boolean[]>();
  for (const row of streakResult.rows) {
    const pid = row.player_id as string;
    const won = row.winning_team === row.team;
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

  // Compute MVP counts
  const mvpArgs: string[] = filtering ? [...gameIds] : [];
  const mvpGameClause = filtering ? `AND g.id IN (${ph})` : "";
  const mvpResult = await db.execute({
    sql: `
      SELECT
        r.player_id,
        p.name,
        r.game_id,
        r.team,
        g.winning_team,
        COALESCE(SUM(CASE WHEN ge.event_type = 'score' THEN ge.point_value ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN ge.event_type = 'steal' THEN 1 ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN ge.event_type = 'block' THEN 1 ELSE 0 END), 0) as fp
      FROM rosters r
      JOIN players p ON r.player_id = p.id
      JOIN games g ON r.game_id = g.id
      LEFT JOIN game_events ge ON ge.game_id = r.game_id AND ge.player_id = r.player_id
      WHERE g.status = 'finished' AND g.winning_team IS NOT NULL AND r.team = g.winning_team ${mvpGameClause}
      GROUP BY r.player_id, r.game_id
    `,
    args: mvpArgs,
  });
  const gameMaxFP = new Map<string, { player_id: string; fp: number }>();
  for (const row of mvpResult.rows) {
    const gameId = row.game_id as string;
    const fp = Number(row.fp);
    const current = gameMaxFP.get(gameId);
    if (!current || fp > current.fp) {
      gameMaxFP.set(gameId, { player_id: row.player_id as string, fp });
    }
  }
  const mvpCountMap = new Map<string, number>();
  for (const { player_id } of gameMaxFP.values()) {
    mvpCountMap.set(player_id, (mvpCountMap.get(player_id) || 0) + 1);
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

export interface TodayStats {
  games_today: number;
  players: PlayerStats[];
}

export async function getTodayStats(dateStr: string): Promise<TodayStats> {
  const db = getDb();

  const countResult = await db.execute({
    sql: "SELECT COUNT(DISTINCT id) as cnt FROM games WHERE date(start_time, '-6 hours') = ?",
    args: [dateStr],
  });
  const games_today = Number(countResult.rows[0]?.cnt ?? 0);

  if (games_today === 0) {
    return { games_today: 0, players: [] };
  }

  const result = await db.execute({
    sql: `
      SELECT
        p.id,
        p.name,
        COUNT(DISTINCT r.game_id) as games_played,
        COALESCE(SUM(CASE
          WHEN g.status = 'finished' AND g.winning_team = r.team THEN 1
          ELSE 0
        END), 0) as wins,
        COALESCE(SUM(CASE
          WHEN g.status = 'finished' AND g.winning_team IS NOT NULL AND g.winning_team != r.team THEN 1
          ELSE 0
        END), 0) as losses,
        COALESCE(scoring.total_points, 0) as total_points,
        COALESCE(scoring.ones_made, 0) as ones_made,
        COALESCE(scoring.twos_made, 0) as twos_made,
        COALESCE(scoring.assists, 0) as assists,
        COALESCE(scoring.steals, 0) as steals,
        COALESCE(scoring.blocks, 0) as blocks,
        COALESCE(eg.effective_games, 1.0) as effective_games
      FROM players p
      JOIN rosters r ON p.id = r.player_id
      JOIN games g ON r.game_id = g.id
      LEFT JOIN (
        SELECT
          ge.player_id,
          SUM(ge.point_value) as total_points,
          SUM(CASE WHEN ge.event_type = 'score' AND ge.point_value = 1
            AND ge.id NOT IN (SELECT corrected_event_id FROM game_events WHERE corrected_event_id IS NOT NULL)
            THEN 1 ELSE 0 END) as ones_made,
          SUM(CASE WHEN ge.event_type = 'score' AND ge.point_value = 2
            AND ge.id NOT IN (SELECT corrected_event_id FROM game_events WHERE corrected_event_id IS NOT NULL)
            THEN 1 ELSE 0 END) as twos_made,
          SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END) as assists,
          SUM(CASE WHEN ge.event_type = 'steal' THEN 1 ELSE 0 END) as steals,
          SUM(CASE WHEN ge.event_type = 'block' THEN 1 ELSE 0 END) as blocks
        FROM game_events ge
        JOIN rosters r2 ON ge.game_id = r2.game_id AND ge.player_id = r2.player_id
        JOIN games g2 ON r2.game_id = g2.id
        WHERE date(g2.start_time, '-6 hours') = ?
        GROUP BY ge.player_id
      ) scoring ON p.id = scoring.player_id
      LEFT JOIN (
        SELECT r_eg.player_id, SUM(COALESCE(gws.winning_score, 11) / 11.0) as effective_games
        FROM rosters r_eg
        JOIN games g_eg ON r_eg.game_id = g_eg.id AND g_eg.status = 'finished'
        LEFT JOIN (
          SELECT ts.game_id, MAX(ts.team_score) as winning_score
          FROM (
            SELECT r3.game_id, r3.team, SUM(ge3.point_value) as team_score
            FROM game_events ge3
            JOIN rosters r3 ON ge3.game_id = r3.game_id AND ge3.player_id = r3.player_id
            GROUP BY r3.game_id, r3.team
          ) ts
          GROUP BY ts.game_id
        ) gws ON r_eg.game_id = gws.game_id
        WHERE date(g_eg.start_time, '-6 hours') = ?
        GROUP BY r_eg.player_id
      ) eg ON p.id = eg.player_id
      WHERE date(g.start_time, '-6 hours') = ?
      GROUP BY p.id
      ORDER BY total_points DESC
    `,
    args: [dateStr, dateStr, dateStr],
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
    return {
      id: row.id as string,
      name: row.name as string,
      games_played: Number(row.games_played),
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
      plus_minus: 0,
      plus_minus_per_game: 0,
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

  // Compute raw +/- for today's games
  const pmResult = await db.execute({
    sql: `
      SELECT
        r.player_id,
        SUM(
          CASE WHEN r.team = 'A' THEN COALESCE(sa.score, 0) - COALESCE(sb.score, 0)
               ELSE COALESCE(sb.score, 0) - COALESCE(sa.score, 0)
          END
        ) as plus_minus
      FROM rosters r
      JOIN games g ON r.game_id = g.id AND g.status = 'finished'
      LEFT JOIN (
        SELECT ge.game_id, SUM(ge.point_value) as score
        FROM game_events ge
        JOIN rosters r2 ON ge.game_id = r2.game_id AND ge.player_id = r2.player_id AND r2.team = 'A'
        GROUP BY ge.game_id
      ) sa ON r.game_id = sa.game_id
      LEFT JOIN (
        SELECT ge.game_id, SUM(ge.point_value) as score
        FROM game_events ge
        JOIN rosters r2 ON ge.game_id = r2.game_id AND ge.player_id = r2.player_id AND r2.team = 'B'
        GROUP BY ge.game_id
      ) sb ON r.game_id = sb.game_id
      WHERE date(g.start_time, '-6 hours') = ?
      GROUP BY r.player_id
    `,
    args: [dateStr],
  });
  for (const row of pmResult.rows) {
    const p = players.find((pl) => pl.id === row.player_id);
    if (p) {
      const pm = Number(row.plus_minus);
      const eg = Number(p.games_played > 0 ? result.rows.find((r) => r.id === p.id)?.effective_games : 1) || 1;
      p.plus_minus = pm;
      p.plus_minus_per_game = r1(pm / eg);
    }
  }

  return { games_today, players };
}

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
  let mvp: BoxScorePlayer | null = null;
  const winningTeam = game.winning_team as string | null;
  if (winningTeam) {
    const winningPlayers = players.filter((p) => p.team === winningTeam);
    mvp = winningPlayers.reduce<BoxScorePlayer | null>(
      (best, p) => (p.fantasy_points > (best?.fantasy_points ?? -1) ? p : best),
      null
    );
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

export async function getGameHistory(limit = 20) {
  const db = getDb();

  const result = await db.execute({
    sql: `
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
      LIMIT ?
    `,
    args: [limit],
  });

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
