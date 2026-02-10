import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { recordEvent, getGameEvents } from "@/lib/events";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await params;
  const events = await getGameEvents(id);
  return NextResponse.json(events);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await params;
  const { player_name, event_type, point_value, corrected_event_id, raw_transcript } =
    await req.json();

  if (!player_name || !event_type || point_value == null) {
    return NextResponse.json(
      { error: "player_name, event_type, and point_value are required" },
      { status: 400 }
    );
  }

  const eventId = await recordEvent(
    id,
    player_name,
    event_type,
    point_value,
    raw_transcript,
    corrected_event_id
  );
  return NextResponse.json({ id: eventId }, { status: 201 });
}
