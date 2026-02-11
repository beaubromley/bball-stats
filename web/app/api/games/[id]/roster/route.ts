import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { setRoster } from "@/lib/events";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { team_a, team_b } = await req.json();

  if (!Array.isArray(team_a) || !Array.isArray(team_b)) {
    return NextResponse.json(
      { error: "team_a and team_b must be arrays of names" },
      { status: 400 }
    );
  }

  await setRoster(id, team_a, team_b);
  return NextResponse.json({ ok: true });
}
