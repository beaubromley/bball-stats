import { NextRequest, NextResponse } from "next/server";
import { createSession, sessionCookie, type Role } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  let role: Role | null = null;
  if (password === process.env.ADMIN_PASSWORD) role = "admin";
  else if (password === process.env.VIEWER_PASSWORD) role = "viewer";

  if (!role) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = await createSession(role);
  const res = NextResponse.json({ ok: true, role });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
}
