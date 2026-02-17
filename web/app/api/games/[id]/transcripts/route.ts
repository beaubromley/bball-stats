import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { saveTranscript } from "@/lib/events";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id, raw_text, acted_on, created_at FROM game_transcripts WHERE game_id = ? ORDER BY created_at ASC",
    args: [id],
  });
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { raw_text, acted_on } = await req.json();

  if (!raw_text) {
    return NextResponse.json({ error: "raw_text is required" }, { status: 400 });
  }

  await saveTranscript(id, raw_text, acted_on ?? null);
  return NextResponse.json({ ok: true }, { status: 201 });
}
