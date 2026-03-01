import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { getSeasonInfo, GAMES_PER_SEASON } from "@/lib/seasons";

export async function GET() {
  await initDb();
  const db = getDb();

  const result = await db.execute(
    "SELECT COUNT(*) as cnt FROM games WHERE status = 'finished'"
  );
  const totalGames = Number(result.rows[0]?.cnt ?? 0);
  const { currentSeason, totalSeasons } = getSeasonInfo(totalGames);

  return NextResponse.json({
    totalGames,
    totalSeasons,
    currentSeason,
    gamesPerSeason: GAMES_PER_SEASON,
  });
}
