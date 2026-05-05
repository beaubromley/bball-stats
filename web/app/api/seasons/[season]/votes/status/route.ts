import { NextRequest, NextResponse } from "next/server";
import { getVotingStatusSummary } from "@/lib/votes";

// Lightweight is-voting-open check used by the home-page banner.
// Avoids the leaderboard / awards pipeline that the full /votes endpoint runs.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ season: string }> },
) {
  const { season: seasonStr } = await params;
  const season = parseInt(seasonStr, 10);
  if (!Number.isFinite(season) || season < 1) {
    return NextResponse.json({ error: "invalid season" }, { status: 400 });
  }
  const status = await getVotingStatusSummary(season);
  return NextResponse.json(status);
}
