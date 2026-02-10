import { NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { getActiveGameWatchData } from "@/lib/events";

export async function GET() {
  try {
    await initDb();
    const data = await getActiveGameWatchData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
