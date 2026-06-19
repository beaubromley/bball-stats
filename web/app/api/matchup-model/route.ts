import { NextResponse } from "next/server";
import { getMatchupModel } from "@/lib/matchup-predictor";

export async function GET() {
  const model = await getMatchupModel();
  return NextResponse.json(model);
}
