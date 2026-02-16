import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { requireAuth } from "@/lib/auth";
import { deleteEvent, updateEvent } from "@/lib/events";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id, eventId } = await params;
  await deleteEvent(id, parseInt(eventId));
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id, eventId } = await params;
  const body = await req.json();
  await updateEvent(id, parseInt(eventId), body);
  return NextResponse.json({ ok: true });
}
