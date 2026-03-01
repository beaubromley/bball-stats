import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { getSeasonGameIds } from "@/lib/stats";

export async function GET(req: NextRequest) {
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

  // Determine which games to include based on season param
  const seasonParam = req.nextUrl.searchParams.get("season");
  let targetGameIds: string[];
  let targetGames: typeof allGames;

  if (seasonParam) {
    const season = parseInt(seasonParam, 10);
    if (!isNaN(season) && season >= 1) {
      const { gameIds } = await getSeasonGameIds(season);
      const idSet = new Set(gameIds);
      targetGameIds = gameIds;
      targetGames = allGames.filter((g) => idSet.has(g.id as string));
    } else {
      targetGameIds = allGames.map((g) => g.id as string);
      targetGames = allGames;
    }
  } else {
    targetGameIds = allGames.map((g) => g.id as string);
    targetGames = allGames;
  }

  if (targetGameIds.length === 0) {
    return NextResponse.json({ gameLabels: [], players: [], allTimeMaxWin: { value: 0, player: "" }, allTimeMaxLoss: { value: 0, player: "" } });
  }

  // Get all roster entries for target games with W/L result
  const placeholders = targetGameIds.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT r.player_id, p.name, r.game_id,
                 CASE WHEN g.winning_team = r.team THEN 'W' ELSE 'L' END as result
          FROM rosters r
          JOIN games g ON r.game_id = g.id
          JOIN players p ON r.player_id = p.id
          WHERE g.id IN (${placeholders}) AND p.status = 'active'
          ORDER BY p.name, g.start_time ASC`,
    args: targetGameIds,
  });

  // Build per-player results across target games
  const playerMap = new Map<string, { name: string; results: Map<string, string> }>();
  for (const row of result.rows) {
    const pid = row.player_id as string;
    if (!playerMap.has(pid)) {
      playerMap.set(pid, { name: row.name as string, results: new Map() });
    }
    playerMap.get(pid)!.results.set(row.game_id as string, row.result as string);
  }

  // Compute running streak across target games, keep last 10 data points
  const last10Ids = targetGameIds.slice(-10);
  let allTimeMaxWin = { value: 0, player: "" };
  let allTimeMaxLoss = { value: 0, player: "" };

  const players = Array.from(playerMap.entries()).map(([id, { name, results }]) => {
    let streak = 0;
    let maxWin = 0;
    let maxLoss = 0;
    const data: (number | null)[] = [];

    for (const gId of targetGameIds) {
      const r = results.get(gId);
      if (!r) {
        // Didn't play this game — skip (don't reset streak)
      } else if (r === "W") {
        streak = streak > 0 ? streak + 1 : 1;
        if (streak > maxWin) maxWin = streak;
      } else {
        streak = streak < 0 ? streak - 1 : -1;
        if (streak < maxLoss) maxLoss = streak;
      }

      // Only record data points for the last 10 games
      if (last10Ids.includes(gId)) {
        data.push(r ? streak : null);
      }
    }

    if (maxWin > allTimeMaxWin.value) {
      allTimeMaxWin = { value: maxWin, player: name };
    }
    if (maxLoss < allTimeMaxLoss.value) {
      allTimeMaxLoss = { value: maxLoss, player: name };
    }

    return { id, name, data };
  });

  // Sort by name for consistent legend order
  players.sort((a, b) => a.name.localeCompare(b.name));

  // Label with game number + date
  const totalGames = targetGames.length;
  const last10Games = targetGames.slice(-10);
  const gameLabels = last10Games.map((g, i) => {
    const gameNum = totalGames - last10Games.length + i + 1;
    const d = new Date(g.start_time as string);
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
    return { gameNum, date, label: `#${gameNum} (${date})` };
  });

  return NextResponse.json({ gameLabels, players, allTimeMaxWin, allTimeMaxLoss });
}
