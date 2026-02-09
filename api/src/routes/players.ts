import { Router } from "express";
import { getDb } from "../services/turso.js";
import { getLeaderboard, getPlayerStats } from "../services/stats.js";

const router = Router();

// List all players with career stats
router.get("/", async (_req, res) => {
  const leaderboard = await getLeaderboard();
  res.json(leaderboard);
});

// Get a specific player's stats
router.get("/:id/stats", async (req, res) => {
  const stats = await getPlayerStats(req.params.id);
  if (!stats) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json(stats);
});

// Get a player's game history (with points scored)
router.get("/:id/games", async (req, res) => {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT g.id, g.start_time, g.status, g.winning_team, r.team,
             CASE WHEN g.winning_team = r.team THEN 'W' ELSE 'L' END as result,
             COALESCE(pts.points, 0) as points_scored
      FROM rosters r
      JOIN games g ON r.game_id = g.id
      LEFT JOIN (
        SELECT game_id, player_id, SUM(point_value) as points
        FROM game_events
        GROUP BY game_id, player_id
      ) pts ON pts.game_id = g.id AND pts.player_id = r.player_id
      WHERE r.player_id = ? AND g.status = 'finished'
      ORDER BY g.start_time DESC
    `,
    args: [req.params.id],
  });
  res.json(result.rows);
});

export default router;
