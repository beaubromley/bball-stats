import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { saveTranscript } from "@/lib/events";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { raw_text } = await req.json();

  if (!raw_text) {
    return NextResponse.json({ error: "raw_text is required" }, { status: 400 });
  }

  await saveTranscript(id, raw_text);
  return NextResponse.json({ ok: true }, { status: 201 });
}
