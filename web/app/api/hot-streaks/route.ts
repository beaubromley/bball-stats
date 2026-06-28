import { NextResponse } from "next/server";
import { getHotStreaks } from "@/lib/hot-streaks";

export async function GET() {
  const data = await getHotStreaks();
  return NextResponse.json(data);
}
