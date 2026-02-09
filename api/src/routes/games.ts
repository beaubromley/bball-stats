import { Router } from "express";
import {
  createGame,
  setRoster,
  recordEvent,
  endGame,
  getGameEvents,
  getActiveGameWatchData,
} from "../services/events.js";
import { getGameHistory } from "../services/stats.js";

const router = Router();

// List games
router.get("/", async (_req, res) => {
  const games = await getGameHistory();
  res.json(games);
});

// Create a new game
router.post("/", async (req, res) => {
  const { location } = req.body;
  const id = await createGame(location);
  res.status(201).json({ id });
});

// Watch endpoint: get active game data (must be before /:id)
router.get("/active", async (_req, res) => {
  const data = await getActiveGameWatchData();
  res.json(data);
});

// Watch endpoint: undo last event in active game (must be before /:id)
router.post("/active/undo", async (_req, res) => {
  const data = await getActiveGameWatchData();
  if (!data.game_id || data.game_status !== "active") {
    res.status(404).json({ error: "No active game" });
    return;
  }
  if (!data.last_event_id || !data.last_event_player) {
    res.status(400).json({ error: "No event to undo" });
    return;
  }

  const eventId = await recordEvent(
    data.game_id,
    data.last_event_player,
    "correction",
    -(data.last_event_points ?? 0),
    "watch-undo",
    data.last_event_id
  );
  res.json({ id: eventId, ok: true });
});

// Set roster for a game
router.post("/:id/roster", async (req, res) => {
  const { id } = req.params;
  const { team_a, team_b } = req.body;

  if (!Array.isArray(team_a) || !Array.isArray(team_b)) {
    res.status(400).json({ error: "team_a and team_b must be arrays of names" });
    return;
  }

  await setRoster(id, team_a, team_b);
  res.json({ ok: true });
});

// Record a scoring event
router.post("/:id/events", async (req, res) => {
  const { id } = req.params;
  const { player_name, event_type, point_value, corrected_event_id, raw_transcript } =
    req.body;

  if (!player_name || !event_type || point_value == null) {
    res.status(400).json({ error: "player_name, event_type, and point_value are required" });
    return;
  }

  const eventId = await recordEvent(
    id,
    player_name,
    event_type,
    point_value,
    raw_transcript,
    corrected_event_id
  );
  res.status(201).json({ id: eventId });
});

// Get a single game with roster
router.get("/:id", async (req, res) => {
  const db = (await import("../services/turso.js")).getDb();
  const game = await db.execute({
    sql: "SELECT * FROM games WHERE id = ?",
    args: [req.params.id],
  });
  if (game.rows.length === 0) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const roster = await db.execute({
    sql: `SELECT r.team, p.name FROM rosters r JOIN players p ON r.player_id = p.id WHERE r.game_id = ? ORDER BY r.team, p.name`,
    args: [req.params.id],
  });
  const teamA = roster.rows.filter((r) => r.team === "A").map((r) => r.name);
  const teamB = roster.rows.filter((r) => r.team === "B").map((r) => r.name);
  res.json({ ...game.rows[0], team_a: teamA, team_b: teamB });
});

// Get events for a game
router.get("/:id/events", async (req, res) => {
  const events = await getGameEvents(req.params.id);
  res.json(events);
});

// Delete a game
router.delete("/:id", async (req, res) => {
  const db = (await import("../services/turso.js")).getDb();
  const { id } = req.params;
  await db.execute({ sql: "DELETE FROM game_events WHERE game_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM rosters WHERE game_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM games WHERE id = ?", args: [id] });
  res.json({ ok: true });
});

// End a game
router.post("/:id/end", async (req, res) => {
  const { winning_team } = req.body;

  if (winning_team !== "A" && winning_team !== "B") {
    res.status(400).json({ error: 'winning_team must be "A" or "B"' });
    return;
  }

  await endGame(req.params.id, winning_team);
  res.json({ ok: true });
});

export default router;
