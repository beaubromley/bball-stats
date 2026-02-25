import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";

export async function POST(request: Request) {
  await initDb();
  const db = getDb();

  try {
    // Fetch GroupMe members (last 2 days)
    const baseUrl = request.url.split("/api/")[0];
    const groupMeResponse = await fetch(`${baseUrl}/api/groupme/members`);

    if (!groupMeResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch GroupMe members" },
        { status: 500 }
      );
    }

    const groupMePlayers = await groupMeResponse.json();

    // Get all existing players
    const existingPlayers = await db.execute("SELECT name, full_name FROM players");
    const existingNames = new Set(
      existingPlayers.rows.map((p: any) => p.name.toLowerCase())
    );
    const existingFullNames = new Set(
      existingPlayers.rows
        .filter((p: any) => p.full_name)
        .map((p: any) => p.full_name.toLowerCase())
    );

    const existing: string[] = [];
    const suggested: Array<{
      fullName: string;
      suggestedDisplay: string;
      suggestedFirst: string;
      suggestedLast: string;
    }> = [];

    for (const player of groupMePlayers) {
      const { displayName, fullName } = player;

      // Check if already in registry by display name or full name
      if (
        existingNames.has(displayName.toLowerCase()) ||
        existingFullNames.has(fullName.toLowerCase())
      ) {
        existing.push(displayName);
        continue;
      }

      // Parse full name for suggestion
      const parts = fullName.split(/\s+/);
      const first = parts[0];
      const last = parts.slice(1).join(" ") || first;

      suggested.push({
        fullName,
        suggestedDisplay: displayName,
        suggestedFirst: first,
        suggestedLast: last,
      });
    }

    return NextResponse.json({ existing, suggested });
  } catch (error) {
    console.error("Error syncing with GroupMe:", error);
    return NextResponse.json(
      { error: "Failed to sync with GroupMe" },
      { status: 500 }
    );
  }
}
