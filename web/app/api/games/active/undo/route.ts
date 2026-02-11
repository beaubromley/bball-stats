import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { getActiveGameWatchData, recordEvent } from "@/lib/events";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const data = await getActiveGameWatchData();

  if (!data.game_id || data.game_status !== "active") {
    return NextResponse.json({ error: "No active game" }, { status: 404 });
  }
  if (!data.last_event_id || !data.last_event_player) {
    return NextResponse.json({ error: "No event to undo" }, { status: 400 });
  }

  const eventId = await recordEvent(
    data.game_id,
    data.last_event_player,
    "correction",
    -(data.last_event_points ?? 0),
    "watch-undo",
    data.last_event_id
  );
  return NextResponse.json({ id: eventId, ok: true });
}
