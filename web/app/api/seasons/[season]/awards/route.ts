import { NextRequest, NextResponse } from "next/server";
import { getSeasonAwards } from "@/lib/awards";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ season: string }> }) {
  const { season: seasonStr } = await params;
  const season = parseInt(seasonStr, 10);
  if (!Number.isFinite(season) || season < 1) {
    return NextResponse.json({ error: "invalid season" }, { status: 400 });
  }
  const awards = await getSeasonAwards(season);
  return NextResponse.json(awards);
}
