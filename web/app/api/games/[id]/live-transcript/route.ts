import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { setLiveTranscript } from "@/lib/events";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { text } = await req.json();

  await setLiveTranscript(id, text || null);
  return NextResponse.json({ ok: true });
}
