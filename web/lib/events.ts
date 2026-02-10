import { v4 as uuid } from "uuid";
import { getDb } from "./turso";

export async function ensurePlayer(name: string): Promise<string> {
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM players WHERE LOWER(name) = LOWER(?)",
    args: [name],
  });
  if (existing.rows.length > 0) {
    return existing.rows[0].id as string;
  }
  const id = uuid();
  await db.execute({
    sql: "INSERT INTO players (id, name) VALUES (?, ?)",
    args: [id, name],
  });
  return id;
}

export async function createGame(location?: string): Promise<string> {
  const db = getDb();
  const id = uuid();
  await db.execute({
    sql: "INSERT INTO games (id, location) VALUES (?, ?)",
    args: [id, location ?? null],
  });
  return id;
}

export async function setRoster(gameId: string, teamA: string[], teamB: string[]) {
  const db = getDb();
  const allPlayers = [
    ...teamA.map((name) => ({ name, team: "A" })),
    ...teamB.map((name) => ({ name, team: "B" })),
  ];
  for (const { name, team } of allPlayers) {
    const playerId = await ensurePlayer(name);
    await db.execute({
      sql: `INSERT OR REPLACE INTO rosters (game_id, player_id, team) VALUES (?, ?, ?)`,
      args: [gameId, playerId, team],
    });
  }
}

export async function recordEvent(
  gameId: string,
  playerName: string,
  eventType: "score" | "correction",
  pointValue: number,
  rawTranscript?: string,
  correctedEventId?: number
): Promise<number> {
  const db = getDb();
  const playerId = await ensurePlayer(playerName);
  const result = await db.execute({
    sql: `INSERT INTO game_events (game_id, player_id, event_type, point_value, corrected_event_id, raw_transcript)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      gameId,
      playerId,
      eventType,
      pointValue,
      correctedEventId ?? null,
      rawTranscript ?? null,
    ],
  });
  return Number(result.lastInsertRowid);
}

export async function endGame(gameId: string, winningTeam: "A" | "B") {
  const db = getDb();
  await db.execute({
    sql: `UPDATE games SET status = 'finished', end_time = CURRENT_TIMESTAMP, winning_team = ? WHERE id = ?`,
    args: [winningTeam, gameId],
  });
}

export async function getGameEvents(gameId: string) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT ge.*, p.name as player_name
          FROM game_events ge
          JOIN players p ON ge.player_id = p.id
          WHERE ge.game_id = ?
          ORDER BY ge.created_at ASC`,
    args: [gameId],
  });
  return result.rows;
}

export async function getActiveGameWatchData() {
  const db = getDb();

  const gameResult = await db.execute({
    sql: `SELECT * FROM games WHERE status IN ('active', 'finished')
          ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, start_time DESC LIMIT 1`,
    args: [],
  });

  if (gameResult.rows.length === 0) {
    return {
      game_id: null,
      team_a_score: 0,
      team_b_score: 0,
      team_a_names: [],
      team_b_names: [],
      last_event: "",
      last_event_id: null,
      last_event_player: null,
      last_event_points: null,
      game_status: "idle" as const,
      target_score: null,
    };
  }

  const game = gameResult.rows[0];
  const gameId = game.id as string;

  const scoreResult = await db.execute({
    sql: `SELECT
            COALESCE(SUM(CASE WHEN r.team = 'A' THEN ge.point_value ELSE 0 END), 0) as team_a_score,
            COALESCE(SUM(CASE WHEN r.team = 'B' THEN ge.point_value ELSE 0 END), 0) as team_b_score
          FROM game_events ge
          JOIN rosters r ON ge.game_id = r.game_id AND ge.player_id = r.player_id
          WHERE ge.game_id = ?`,
    args: [gameId],
  });

  const scores = scoreResult.rows[0];

  const rosterResult = await db.execute({
    sql: `SELECT p.name, r.team
          FROM rosters r
          JOIN players p ON r.player_id = p.id
          WHERE r.game_id = ?
          ORDER BY r.team, p.name`,
    args: [gameId],
  });

  const teamANames = rosterResult.rows.filter((r) => r.team === "A").map((r) => r.name as string);
  const teamBNames = rosterResult.rows.filter((r) => r.team === "B").map((r) => r.name as string);

  const lastEventResult = await db.execute({
    sql: `SELECT ge.id, ge.point_value, p.name as player_name
          FROM game_events ge
          JOIN players p ON ge.player_id = p.id
          WHERE ge.game_id = ? AND ge.event_type = 'score'
            AND ge.id NOT IN (
              SELECT corrected_event_id FROM game_events
              WHERE game_id = ? AND event_type = 'correction' AND corrected_event_id IS NOT NULL
            )
          ORDER BY ge.created_at DESC
          LIMIT 1`,
    args: [gameId, gameId],
  });

  let lastEvent = "";
  let lastEventId: number | null = null;
  let lastEventPlayer: string | null = null;
  let lastEventPoints: number | null = null;

  if (lastEventResult.rows.length > 0) {
    const evt = lastEventResult.rows[0];
    lastEventId = evt.id as number;
    lastEventPlayer = evt.player_name as string;
    lastEventPoints = evt.point_value as number;
    lastEvent = `${lastEventPlayer} +${lastEventPoints}`;
  }

  return {
    game_id: gameId,
    team_a_score: Number(scores.team_a_score),
    team_b_score: Number(scores.team_b_score),
    team_a_names: teamANames,
    team_b_names: teamBNames,
    last_event: lastEvent,
    last_event_id: lastEventId,
    last_event_player: lastEventPlayer,
    last_event_points: lastEventPoints,
    game_status: (game.status as string) === "finished" ? ("finished" as const) : ("active" as const),
    target_score: game.target_score != null ? Number(game.target_score) : null,
  };
}
