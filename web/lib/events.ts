import { v4 as uuid } from "uuid";
import { getDb } from "./turso";

export async function ensurePlayer(name: string, fullName?: string): Promise<string> {
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id, full_name FROM players WHERE LOWER(name) = LOWER(?)",
    args: [name],
  });
  if (existing.rows.length > 0) {
    // Update full_name if we have it and it's not set yet
    if (fullName && !existing.rows[0].full_name) {
      await db.execute({
        sql: "UPDATE players SET full_name = ? WHERE id = ?",
        args: [fullName, existing.rows[0].id],
      });
    }
    return existing.rows[0].id as string;
  }
  const id = uuid();
  await db.execute({
    sql: "INSERT INTO players (id, name, full_name) VALUES (?, ?, ?)",
    args: [id, name, fullName ?? null],
  });
  return id;
}

export async function createGame(location?: string, targetScore?: number, scoringMode?: string): Promise<string> {
  const db = getDb();
  const id = uuid();
  await db.execute({
    sql: "INSERT INTO games (id, location, target_score, scoring_mode) VALUES (?, ?, ?, ?)",
    args: [id, location ?? null, targetScore ?? null, scoringMode ?? "1s2s"],
  });
  return id;
}

export async function setRoster(
  gameId: string,
  teamA: string[],
  teamB: string[],
  fullNames?: Record<string, string>
) {
  const db = getDb();
  const allPlayers = [
    ...teamA.map((name) => ({ name, team: "A" })),
    ...teamB.map((name) => ({ name, team: "B" })),
  ];
  for (const { name, team } of allPlayers) {
    const playerId = await ensurePlayer(name, fullNames?.[name]);
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
  correctedEventId?: number,
  assistedEventId?: number
): Promise<number> {
  const db = getDb();
  const playerId = await ensurePlayer(playerName);
  const result = await db.execute({
    sql: `INSERT INTO game_events (game_id, player_id, event_type, point_value, corrected_event_id, raw_transcript, assisted_event_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      gameId,
      playerId,
      eventType,
      pointValue,
      correctedEventId ?? null,
      rawTranscript ?? null,
      assistedEventId ?? null,
    ],
  });

  // Update last_played_date for "expected to play" logic
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  await db.execute({
    sql: "UPDATE players SET last_played_date = ? WHERE id = ?",
    args: [today, playerId],
  });

  return Number(result.lastInsertRowid);
}

export async function setFailedTranscript(gameId: string, text: string | null) {
  const db = getDb();
  await db.execute({
    sql: "UPDATE games SET last_failed_transcript = ? WHERE id = ?",
    args: [text, gameId],
  });
}

export async function setLiveTranscript(gameId: string, text: string | null) {
  const db = getDb();
  await db.execute({
    sql: "UPDATE games SET live_transcript = ? WHERE id = ?",
    args: [text, gameId],
  });
}

export async function saveTranscript(gameId: string, rawText: string, actedOn?: string | null) {
  const db = getDb();
  await db.execute({
    sql: "INSERT INTO game_transcripts (game_id, raw_text, acted_on) VALUES (?, ?, ?)",
    args: [gameId, rawText, actedOn ?? null],
  });
}

export async function deleteEvent(gameId: string, eventId: number) {
  const db = getDb();
  // Delete any corrections that reference this event
  await db.execute({
    sql: "DELETE FROM game_events WHERE game_id = ? AND corrected_event_id = ?",
    args: [gameId, eventId],
  });
  await db.execute({
    sql: "DELETE FROM game_events WHERE game_id = ? AND id = ?",
    args: [gameId, eventId],
  });
}

export async function swapEventOrder(gameId: string, eventIdA: number, eventIdB: number) {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id, created_at FROM game_events WHERE game_id = ? AND id IN (?, ?)",
    args: [gameId, eventIdA, eventIdB],
  });
  if (result.rows.length !== 2) return;
  const a = result.rows.find((r) => r.id === eventIdA);
  const b = result.rows.find((r) => r.id === eventIdB);
  if (!a || !b) return;
  await db.execute({ sql: "UPDATE game_events SET created_at = ? WHERE id = ?", args: [b.created_at, eventIdA] });
  await db.execute({ sql: "UPDATE game_events SET created_at = ? WHERE id = ?", args: [a.created_at, eventIdB] });
}

export async function updateEvent(
  gameId: string,
  eventId: number,
  updates: { player_name?: string; point_value?: number }
) {
  const db = getDb();
  if (updates.player_name) {
    const playerId = await ensurePlayer(updates.player_name);
    await db.execute({
      sql: "UPDATE game_events SET player_id = ? WHERE game_id = ? AND id = ?",
      args: [playerId, gameId, eventId],
    });
  }
  if (updates.point_value != null) {
    await db.execute({
      sql: "UPDATE game_events SET point_value = ? WHERE game_id = ? AND id = ?",
      args: [updates.point_value, gameId, eventId],
    });
  }
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
      last_failed_transcript: null,
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

  // Get recent events of all types (last 10, then merge assists into scores) for watch feed
  const recentEventsResult = await db.execute({
    sql: `SELECT ge.id, ge.event_type, ge.point_value, p.name as player_name, ge.created_at
          FROM game_events ge
          JOIN players p ON ge.player_id = p.id
          WHERE ge.game_id = ?
          ORDER BY ge.created_at DESC
          LIMIT 10`,
    args: [gameId],
  });

  // Build raw list, then merge assist into preceding score
  const rawEvents = recentEventsResult.rows.map((r) => ({
    id: r.id as number,
    type: r.event_type as string,
    name: (r.player_name as string).split(/\s/)[0],
    pts: r.point_value as number,
  })).reverse(); // chronological

  const merged: { id: number; type: string; label: string }[] = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const e = rawEvents[i];
    if (e.type === "assist") {
      // Attach to previous score if it exists
      if (merged.length > 0 && merged[merged.length - 1].type === "score") {
        merged[merged.length - 1].label += ` (${e.name})`;
        continue;
      }
    }
    let label = "";
    if (e.type === "score") label = `${e.name} +${e.pts}`;
    else if (e.type === "correction") label = `UNDO ${e.name}`;
    else if (e.type === "steal") label = `${e.name} STL`;
    else if (e.type === "block") label = `${e.name} BLK`;
    else if (e.type === "assist") label = `${e.name} AST`;
    else label = `${e.name} ${e.type.toUpperCase()}`;
    merged.push({ id: e.id, type: e.type, label });
  }

  const recent_events = merged.slice(-5);

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
    last_failed_transcript: (game.last_failed_transcript as string) || null,
    live_transcript: (game.live_transcript as string) || null,
    recent_events,
  };
}
