import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";

export async function GET() {
  await initDb();
  const db = getDb();

  // Get last 10 finished games overall (the shared x-axis)
  const gamesResult = await db.execute({
    sql: `SELECT id, start_time FROM games
          WHERE status = 'finished'
          ORDER BY start_time DESC
          LIMIT 10`,
    args: [],
  });

  const games = gamesResult.rows.reverse(); // oldest first
  if (games.length === 0) return NextResponse.json({ gameLabels: [], players: [] });

  const gameIds = games.map((g) => g.id as string);

  // Get all roster entries for these games with W/L result
  const placeholders = gameIds.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT r.player_id, p.name, r.game_id,
                 CASE WHEN g.winning_team = r.team THEN 'W' ELSE 'L' END as result
          FROM rosters r
          JOIN games g ON r.game_id = g.id
          JOIN players p ON r.player_id = p.id
          WHERE g.id IN (${placeholders}) AND p.status = 'active'
          ORDER BY p.name, g.start_time ASC`,
    args: gameIds,
  });

  // Build per-player streak data
  const playerMap = new Map<string, { name: string; results: Map<string, string> }>();
  for (const row of result.rows) {
    const pid = row.player_id as string;
    if (!playerMap.has(pid)) {
      playerMap.set(pid, { name: row.name as string, results: new Map() });
    }
    playerMap.get(pid)!.results.set(row.game_id as string, row.result as string);
  }

  // Compute running streak for each player across the 10 games
  const players = Array.from(playerMap.entries()).map(([id, { name, results }]) => {
    let streak = 0;
    const data: (number | null)[] = [];

    for (const gId of gameIds) {
      const r = results.get(gId);
      if (!r) {
        // Didn't play this game — gap
        data.push(null);
        // Don't reset streak; keep it for when they return
      } else if (r === "W") {
        streak = streak > 0 ? streak + 1 : 1;
        data.push(streak);
      } else {
        streak = streak < 0 ? streak - 1 : -1;
        data.push(streak);
      }
    }

    return { id, name, data };
  });

  // Sort by name for consistent legend order
  players.sort((a, b) => a.name.localeCompare(b.name));

  // Format game labels
  const gameLabels = games.map((g) => {
    const d = new Date(g.start_time as string);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
  });

  return NextResponse.json({ gameLabels, players });
}
