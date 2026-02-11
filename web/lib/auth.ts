import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "bball_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

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

async function signToken(): Promise<string> {
  const key = await getKey();
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode("authenticated")
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyToken(token: string): Promise<boolean> {
  const key = await getKey();
  const encoder = new TextEncoder();
  const match = token.match(/.{1,2}/g);
  if (!match) return false;
  const sig = new Uint8Array(match.map((byte) => parseInt(byte, 16)));
  return crypto.subtle.verify("HMAC", key, sig, encoder.encode("authenticated"));
}

export async function createSession(): Promise<string> {
  return signToken();
}

export async function isAuthenticated(req: NextRequest): Promise<boolean> {
  // Check x-api-key header (for Garmin watch)
  const apiKey = req.headers.get("x-api-key");
  if (apiKey && apiKey === process.env.ADMIN_API_KEY) {
    return true;
  }

  // Check session cookie
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    return await verifyToken(token);
  } catch {
    return false;
  }
}

export async function requireAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Secure`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}
