import { NextResponse } from "next/server";
import { initDb } from "@/lib/turso";
import { getSingleGameRecords, getMilestoneWatch } from "@/lib/records";

export async function GET() {
  await initDb();
  const [records, milestones] = await Promise.all([
    getSingleGameRecords(),
    getMilestoneWatch(),
  ]);
  return NextResponse.json({ records, milestones });
}
