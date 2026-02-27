import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";

export async function GET() {
  await initDb();
  const db = getDb();

  // Get ALL finished games (need full history for accurate streaks)
  const gamesResult = await db.execute({
    sql: `SELECT id, start_time FROM games
          WHERE status = 'finished'
          ORDER BY start_time ASC`,
    args: [],
  });

  const allGames = gamesResult.rows;
  if (allGames.length === 0) return NextResponse.json({ gameLabels: [], players: [] });

  const allGameIds = allGames.map((g) => g.id as string);

  // Get all roster entries for ALL games with W/L result
  const placeholders = allGameIds.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT r.player_id, p.name, r.game_id,
                 CASE WHEN g.winning_team = r.team THEN 'W' ELSE 'L' END as result
          FROM rosters r
          JOIN games g ON r.game_id = g.id
          JOIN players p ON r.player_id = p.id
          WHERE g.id IN (${placeholders}) AND p.status = 'active'
          ORDER BY p.name, g.start_time ASC`,
    args: allGameIds,
  });

  // Build per-player results across ALL games
  const playerMap = new Map<string, { name: string; results: Map<string, string> }>();
  for (const row of result.rows) {
    const pid = row.player_id as string;
    if (!playerMap.has(pid)) {
      playerMap.set(pid, { name: row.name as string, results: new Map() });
    }
    playerMap.get(pid)!.results.set(row.game_id as string, row.result as string);
  }

  // Compute running streak across ALL games, but only keep last 10 data points
  const last10Ids = allGameIds.slice(-10);

  const players = Array.from(playerMap.entries()).map(([id, { name, results }]) => {
    let streak = 0;
    const data: (number | null)[] = [];

    for (const gId of allGameIds) {
      const r = results.get(gId);
      if (!r) {
        // Didn't play this game — skip (don't reset streak)
      } else if (r === "W") {
        streak = streak > 0 ? streak + 1 : 1;
      } else {
        streak = streak < 0 ? streak - 1 : -1;
      }

      // Only record data points for the last 10 games
      if (last10Ids.includes(gId)) {
        data.push(r ? streak : null);
      }
    }

    return { id, name, data };
  });

  // Sort by name for consistent legend order
  players.sort((a, b) => a.name.localeCompare(b.name));

  // Label with game number + date
  const totalGames = allGames.length;
  const last10Games = allGames.slice(-10);
  const gameLabels = last10Games.map((g, i) => {
    const gameNum = totalGames - last10Games.length + i + 1;
    const d = new Date(g.start_time as string);
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
    return `#${gameNum} (${date})`;
  });

  return NextResponse.json({ gameLabels, players });
}
