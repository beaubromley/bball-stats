import { NextResponse } from "next/server";
import { initDb } from "@/lib/turso";

export async function GET() {
  try {
    await initDb();
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: String(err), hasUrl: !!process.env.TURSO_DATABASE_URL, hasToken: !!process.env.TURSO_AUTH_TOKEN },
      { status: 500 }
    );
  }
}
