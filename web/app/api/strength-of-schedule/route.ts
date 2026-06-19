import { NextRequest, NextResponse } from "next/server";
import { getStrengthOfSchedule } from "@/lib/matchup-predictor";

export async function GET(req: NextRequest) {
  const seasonParam = req.nextUrl.searchParams.get("season");
  let season: number | undefined;
  if (seasonParam) {
    const n = parseInt(seasonParam, 10);
    if (isNaN(n) || n < 1) {
      return NextResponse.json({ error: "Invalid season" }, { status: 400 });
    }
    season = n;
  }
  const data = await getStrengthOfSchedule(season);
  return NextResponse.json(data);
}
