import { NextResponse } from "next/server";
import { getStrengthOfSchedule } from "@/lib/matchup-predictor";

export async function GET() {
  const data = await getStrengthOfSchedule();
  return NextResponse.json(data);
}
