import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  const projectId = process.env.DEEPGRAM_PROJECT_ID;
  if (!apiKey) {
    return NextResponse.json({ error: "Deepgram not configured" }, { status: 500 });
  }

  // Create a short-lived temporary key for browser WebSocket auth
  if (projectId) {
    try {
      const res = await fetch(
        `https://api.deepgram.com/v1/projects/${projectId}/keys`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            comment: "browser-temp",
            scopes: ["usage:write"],
            time_to_live_in_seconds: 300,
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ token: data.key, source: "temp-key" });
      }
      // Log why temp key creation failed
      const errText = await res.text().catch(() => "unknown");
      console.error(`Deepgram temp key failed: ${res.status} ${errText}`);
      return NextResponse.json({
        token: apiKey,
        source: "raw-key",
        tempKeyError: `${res.status}: ${errText.slice(0, 200)}`,
      });
    } catch (err) {
      console.error("Deepgram temp key exception:", err);
      return NextResponse.json({
        token: apiKey,
        source: "raw-key",
        tempKeyError: `exception: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({ token: apiKey, source: "raw-key", tempKeyError: "no project ID" });
}
