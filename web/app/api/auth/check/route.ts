import { NextRequest, NextResponse } from "next/server";
import { getRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const role = await getRole(req);
  return NextResponse.json({ authenticated: !!role, role: role || null });
}
