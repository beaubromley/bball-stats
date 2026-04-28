import { NextRequest, NextResponse } from "next/server";
import { castVote, getVotingState } from "@/lib/votes";

function parseSeason(seasonStr: string): number | null {
  const n = parseInt(seasonStr, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ season: string }> },
) {
  const { season: seasonStr } = await params;
  const season = parseSeason(seasonStr);
  if (season === null) {
    return NextResponse.json({ error: "invalid season" }, { status: 400 });
  }
  const state = await getVotingState(season);
  return NextResponse.json(state);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ season: string }> },
) {
  const { season: seasonStr } = await params;
  const season = parseSeason(seasonStr);
  if (season === null) {
    return NextResponse.json({ error: "invalid season" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const voter_player_id = typeof body?.voter_player_id === "string" ? body.voter_player_id : "";
  const pick_1 = typeof body?.pick_1 === "string" ? body.pick_1 : "";
  const pick_2 = typeof body?.pick_2 === "string" ? body.pick_2 : "";
  const pick_3 = typeof body?.pick_3 === "string" ? body.pick_3 : "";
  if (!voter_player_id || !pick_1 || !pick_2 || !pick_3) {
    return NextResponse.json({ error: "missing required field" }, { status: 400 });
  }

  const ip_address =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const user_agent = req.headers.get("user-agent") ?? null;

  const result = await castVote({
    season,
    voter_player_id,
    pick_1,
    pick_2,
    pick_3,
    ip_address,
    user_agent,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
