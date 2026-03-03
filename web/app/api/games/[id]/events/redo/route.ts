import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { requireAuth } from "@/lib/auth";
import { deleteCorrectionFor } from "@/lib/events";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { corrected_event_id } = await req.json();
  if (!corrected_event_id) {
    return NextResponse.json({ error: "corrected_event_id required" }, { status: 400 });
  }
  await deleteCorrectionFor(id, corrected_event_id);
  return NextResponse.json({ ok: true });
}
