import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await initDb();
  const { id } = await params;
  const { target_score } = await req.json();

  if (!target_score || typeof target_score !== "number" || target_score < 1) {
    return NextResponse.json({ error: "Invalid target_score" }, { status: 400 });
  }

  const db = getDb();
  await db.execute({
    sql: "UPDATE games SET target_score = ? WHERE id = ?",
    args: [target_score, id],
  });

  return NextResponse.json({ ok: true });
}
