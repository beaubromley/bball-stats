import { NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { getAllRecords } from "@/lib/records";

export async function GET() {
  await initDb();
  const bundle = await getAllRecords();
  return NextResponse.json(bundle);
}
