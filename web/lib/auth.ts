import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "bball_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type Role = "admin" | "viewer";

async function getKey(): Promise<CryptoKey> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD env var not set");
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signToken(role: Role): Promise<string> {
  const key = await getKey();
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`authenticated:${role}`));
  const sig = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${role}:${sig}`;
}

async function verifyToken(token: string): Promise<Role | null> {
  const key = await getKey();
  const encoder = new TextEncoder();

  const colonIdx = token.indexOf(":");
  if (colonIdx > 0) {
    const role = token.slice(0, colonIdx) as Role;
    const sigHex = token.slice(colonIdx + 1);
    if (role !== "admin" && role !== "viewer") return null;
    const match = sigHex.match(/.{1,2}/g);
    if (!match) return null;
    const sig = new Uint8Array(match.map((byte) => parseInt(byte, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sig, encoder.encode(`authenticated:${role}`));
    return valid ? role : null;
  }

  // Legacy format (no role prefix) — treat as admin
  const match = token.match(/.{1,2}/g);
  if (!match) return null;
  const sig = new Uint8Array(match.map((byte) => parseInt(byte, 16)));
  const valid = await crypto.subtle.verify("HMAC", key, sig, encoder.encode("authenticated"));
  return valid ? "admin" : null;
}

export async function createSession(role: Role): Promise<string> {
  return signToken(role);
}

export async function getRole(req: NextRequest): Promise<Role | null> {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey && apiKey === process.env.ADMIN_API_KEY) return "admin";

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try { return await verifyToken(token); } catch { return null; }
}

export async function isAuthenticated(req: NextRequest): Promise<boolean> {
  return (await getRole(req)) !== null;
}

export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  if (!(await getRole(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  if ((await getRole(req)) !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Secure`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}
