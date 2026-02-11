import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authed = await isAuthenticated(req);
  return NextResponse.json({ authenticated: authed });
}
