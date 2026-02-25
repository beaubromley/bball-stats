import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { getLeaderboard } from "@/lib/stats";
import { v4 as uuid } from "uuid";

export async function GET(request: Request) {
  await initDb();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "active";
  const expected = searchParams.get("expected") === "true";
  const leaderboard = searchParams.get("leaderboard") === "true";

  // Legacy leaderboard endpoint
  if (leaderboard || (!searchParams.has("status") && !searchParams.has("expected"))) {
    const leaderboardData = await getLeaderboard();
    return NextResponse.json(leaderboardData);
  }

  const db = getDb();

  if (expected) {
    // Get "expected to play" list
    const today = new Date().toISOString().split("T")[0];

    // Get players who played today
    const playedToday = await db.execute({
      sql: `SELECT * FROM players
            WHERE status = 'active'
            AND last_played_date = ?`,
      args: [today],
    });

    // Get GroupMe active members (last 2 days)
    let groupMeNames = new Set<string>();
    try {
      const baseUrl = request.url.split("/api/")[0];
      const groupMeResponse = await fetch(`${baseUrl}/api/groupme/members`);
      if (groupMeResponse.ok) {
        const groupMePlayers = await groupMeResponse.json();
        groupMeNames = new Set(groupMePlayers.map((p: any) => p.displayName));
      }
    } catch (error) {
      console.error("Failed to fetch GroupMe members:", error);
    }

    // Get players from GroupMe list
    const groupMePlayers = groupMeNames.size > 0
      ? await db.execute({
          sql: `SELECT * FROM players
                WHERE status = 'active'
                AND name IN (${Array.from(groupMeNames).map(() => "?").join(",")})`,
          args: Array.from(groupMeNames),
        })
      : { rows: [] };

    // Combine and deduplicate
    const playerMap = new Map();
    for (const player of [...playedToday.rows, ...groupMePlayers.rows]) {
      playerMap.set(player.id, player);
    }

    const players = Array.from(playerMap.values()).map(transformPlayer);
    return NextResponse.json({ players });
  }

  // Get all players with status filter
  let query = "SELECT * FROM players";
  const args: any[] = [];

  if (status !== "all") {
    query += " WHERE status = ?";
    args.push(status);
  }

  query += " ORDER BY name ASC";

  const result = await db.execute({ sql: query, args });
  const players = result.rows.map(transformPlayer);

  return NextResponse.json({ players });
}

export async function POST(request: Request) {
  await initDb();
  const db = getDb();

  try {
    const body = await request.json();
    const { first_name, last_name, full_name, aliases, status } = body;

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: "first_name and last_name are required" },
        { status: 400 }
      );
    }

    // Generate display name: "First L."
    const displayName = `${first_name} ${last_name.charAt(0).toUpperCase()}.`;

    // Check for duplicate display name
    const existing = await db.execute({
      sql: "SELECT id FROM players WHERE LOWER(name) = LOWER(?)",
      args: [displayName],
    });

    if (existing.rows.length > 0) {
      // Auto-disambiguate: append more of last name
      const lastInitials = last_name.length > 1
        ? `${last_name.charAt(0).toUpperCase()}${last_name.charAt(1).toLowerCase()}.`
        : last_name;
      const disambiguatedName = `${first_name} ${lastInitials}`;

      const existingDisambiguated = await db.execute({
        sql: "SELECT id FROM players WHERE LOWER(name) = LOWER(?)",
        args: [disambiguatedName],
      });

      if (existingDisambiguated.rows.length > 0) {
        return NextResponse.json(
          { error: `Player with name "${disambiguatedName}" already exists` },
          { status: 409 }
        );
      }

      // Use disambiguated name
      return createPlayer(db, {
        first_name,
        last_name,
        name: disambiguatedName,
        full_name: full_name || `${first_name} ${last_name}`,
        aliases: aliases || [],
        status: status || "active",
      });
    }

    return createPlayer(db, {
      first_name,
      last_name,
      name: displayName,
      full_name: full_name || `${first_name} ${last_name}`,
      aliases: aliases || [],
      status: status || "active",
    });
  } catch (error) {
    console.error("Error creating player:", error);
    return NextResponse.json(
      { error: "Failed to create player" },
      { status: 500 }
    );
  }
}

async function createPlayer(db: any, data: any) {
  const id = uuid();

  await db.execute({
    sql: `INSERT INTO players (id, name, first_name, last_name, full_name, aliases, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    args: [
      id,
      data.name,
      data.first_name,
      data.last_name,
      data.full_name,
      JSON.stringify(data.aliases),
      data.status,
    ],
  });

  const result = await db.execute({
    sql: "SELECT * FROM players WHERE id = ?",
    args: [id],
  });

  return NextResponse.json(transformPlayer(result.rows[0]), { status: 201 });
}

function transformPlayer(row: any) {
  return {
    id: row.id,
    name: row.name,
    first_name: row.first_name,
    last_name: row.last_name,
    display_name: row.name,
    full_name: row.full_name,
    aliases: row.aliases ? JSON.parse(row.aliases) : [],
    status: row.status || "active",
    last_played_date: row.last_played_date,
    created_at: row.created_at,
  };
}
