import { getDb } from "./turso";
import { calculateFantasyPoints } from "./fantasy";

export interface PlayerStats {
  id: string;
  name: string;
  games_played: number;
  wins: number;
  losses: number;
  win_pct: number;
  total_points: number;
  ppg: number;
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
}

export async function getLeaderboard(): Promise<PlayerStats[]> {
  const db = getDb();

  const result = await db.execute(`
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
      COALESCE(scoring.blocks, 0) as blocks
    FROM players p
    JOIN rosters r ON p.id = r.player_id
    JOIN games g ON r.game_id = g.id
    LEFT JOIN (
      SELECT
        player_id,
        SUM(point_value) as total_points,
        SUM(CASE WHEN event_type = 'score' AND point_value = 1
          AND id NOT IN (SELECT corrected_event_id FROM game_events WHERE corrected_event_id IS NOT NULL)
          THEN 1 ELSE 0 END) as ones_made,
        SUM(CASE WHEN event_type = 'score' AND point_value = 2
          AND id NOT IN (SELECT corrected_event_id FROM game_events WHERE corrected_event_id IS NOT NULL)
          THEN 1 ELSE 0 END) as twos_made,
        SUM(CASE WHEN event_type = 'assist' THEN 1 ELSE 0 END) as assists,
        SUM(CASE WHEN event_type = 'steal' THEN 1 ELSE 0 END) as steals,
        SUM(CASE WHEN event_type = 'block' THEN 1 ELSE 0 END) as blocks
      FROM game_events
      GROUP BY player_id
    ) scoring ON p.id = scoring.player_id
    GROUP BY p.id
    ORDER BY wins DESC, total_points DESC
  `);

  return result.rows.map((row) => {
    const gamesPlayed = Number(row.games_played) || 1;
    const totalPoints = Number(row.total_points);
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
      ppg: Math.round((totalPoints / gamesPlayed) * 10) / 10,
      ones_made: Number(row.ones_made),
      twos_made: Number(row.twos_made),
      assists,
      steals,
      blocks,
      fantasy_points: calculateFantasyPoints({ points: totalPoints, assists, steals, blocks }),
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
        COALESCE(scoring.blocks, 0) as blocks
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
      WHERE date(g.start_time, '-6 hours') = ?
      GROUP BY p.id
      ORDER BY total_points DESC
    `,
    args: [dateStr, dateStr],
  });

  const players = result.rows.map((row) => {
    const gamesPlayed = Number(row.games_played) || 1;
    const totalPoints = Number(row.total_points);
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
      ppg: Math.round((totalPoints / gamesPlayed) * 10) / 10,
      ones_made: Number(row.ones_made),
      twos_made: Number(row.twos_made),
      assists,
      steals,
      blocks,
      fantasy_points: calculateFantasyPoints({ points: totalPoints, assists, steals, blocks }),
    };
  });

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
        COALESCE(SUM(CASE WHEN ge.event_type = 'score' THEN ge.point_value ELSE 0 END), 0) as points,
        COALESCE(SUM(CASE WHEN ge.event_type = 'score' AND ge.point_value = 1
          AND ge.id NOT IN (SELECT corrected_event_id FROM game_events WHERE corrected_event_id IS NOT NULL AND game_id = ?)
          THEN 1 ELSE 0 END), 0) as ones_made,
        COALESCE(SUM(CASE WHEN ge.event_type = 'score' AND ge.point_value = 2
          AND ge.id NOT IN (SELECT corrected_event_id FROM game_events WHERE corrected_event_id IS NOT NULL AND game_id = ?)
          THEN 1 ELSE 0 END), 0) as twos_made,
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
    args: [gameId, gameId, gameId],
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

  return result.rows.map((row) => ({
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
  }));
}
