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

    const groupMeMembers: { user_id: string; name: string }[] = await groupMeResponse.json();

    // Get all existing players
    const existingPlayers = await db.execute("SELECT name, full_name, groupme_user_id FROM players");
    const existingNames = new Set(
      existingPlayers.rows.map((p: any) => p.name.toLowerCase())
    );
    const existingFullNames = new Set(
      existingPlayers.rows
        .filter((p: any) => p.full_name)
        .map((p: any) => p.full_name.toLowerCase())
    );
    const existingGroupMeIds = new Set(
      existingPlayers.rows
        .filter((p: any) => p.groupme_user_id)
        .map((p: any) => p.groupme_user_id)
    );

    const existing: string[] = [];
    const suggested: Array<{
      groupme_user_id: string;
      groupme_name: string;
      suggestedFirst: string;
      suggestedLast: string;
    }> = [];

    for (const member of groupMeMembers) {
      // Check if already linked by groupme_user_id
      if (existingGroupMeIds.has(member.user_id)) {
        existing.push(member.name);
        continue;
      }

      // Check by name/full_name as fallback
      if (existingNames.has(member.name.toLowerCase()) ||
          existingFullNames.has(member.name.toLowerCase())) {
        existing.push(member.name);
        continue;
      }

      // Parse name for suggestion
      const parts = member.name.split(/\s+/);
      const first = parts[0];
      const last = parts.slice(1).join(" ") || first;

      suggested.push({
        groupme_user_id: member.user_id,
        groupme_name: member.name,
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
