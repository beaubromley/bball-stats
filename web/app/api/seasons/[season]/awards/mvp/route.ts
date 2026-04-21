import { NextRequest, NextResponse } from "next/server";
import { setSeasonMvp } from "@/lib/awards";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ season: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { season: seasonStr } = await params;
  const season = parseInt(seasonStr, 10);
  if (!Number.isFinite(season) || season < 1) {
    return NextResponse.json({ error: "invalid season" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const playerId = typeof body?.player_id === "string" && body.player_id.length > 0
    ? body.player_id
    : null;

  await setSeasonMvp(season, playerId);
  return NextResponse.json({ ok: true, season, player_id: playerId });
}
