import { NextRequest, NextResponse } from "next/server";
import { resetVoting } from "@/lib/votes";
import { requireAdmin } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ season: string }> },
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { season: seasonStr } = await params;
  const season = parseInt(seasonStr, 10);
  if (!Number.isFinite(season) || season < 1) {
    return NextResponse.json({ error: "invalid season" }, { status: 400 });
  }

  await resetVoting(season);
  return NextResponse.json({ ok: true });
}
