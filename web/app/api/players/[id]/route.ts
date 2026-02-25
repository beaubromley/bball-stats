import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb();
  const db = getDb();
  const { id } = await params;

  try {
    const body = await request.json();
    const { first_name, last_name, full_name, aliases, status, notes, last_played_date } = body;

    // Build dynamic UPDATE query
    const updates: string[] = [];
    const args: any[] = [];

    if (first_name !== undefined) {
      updates.push("first_name = ?");
      args.push(first_name);
    }
    if (last_name !== undefined) {
      updates.push("last_name = ?");
      args.push(last_name);
    }
    if (full_name !== undefined) {
      updates.push("full_name = ?");
      args.push(full_name);
    }
    if (aliases !== undefined) {
      updates.push("aliases = ?");
      args.push(JSON.stringify(aliases));
    }
    if (status !== undefined) {
      updates.push("status = ?");
      args.push(status);
    }
    if (notes !== undefined) {
      updates.push("notes = ?");
      args.push(notes);
    }
    if (last_played_date !== undefined) {
      updates.push("last_played_date = ?");
      args.push(last_played_date);
    }

    // Update display name if first or last name changed
    if (first_name !== undefined || last_name !== undefined) {
      // Get current player data
      const current = await db.execute({
        sql: "SELECT first_name, last_name FROM players WHERE id = ?",
        args: [id],
      });

      if (current.rows.length === 0) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }

      const firstName = first_name || current.rows[0].first_name;
      const lastName = last_name || current.rows[0].last_name;
      const displayName = `${firstName} ${lastName.charAt(0).toUpperCase()}.`;

      updates.push("name = ?");
      args.push(displayName);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    args.push(id);

    await db.execute({
      sql: `UPDATE players SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    const result = await db.execute({
      sql: "SELECT * FROM players WHERE id = ?",
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json(transformPlayer(result.rows[0]));
  } catch (error) {
    console.error("Error updating player:", error);
    return NextResponse.json({ error: "Failed to update player" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb();
  const db = getDb();
  const { id } = await params;

  try {
    // Check if player has game history
    const gameHistory = await db.execute({
      sql: `SELECT COUNT(*) as count FROM rosters WHERE player_id = ?
            UNION ALL
            SELECT COUNT(*) as count FROM game_events WHERE player_id = ?`,
      args: [id, id],
    });

    const hasHistory = gameHistory.rows.some((row: any) => Number(row.count) > 0);

    if (hasHistory) {
      // Soft delete: set status to inactive
      await db.execute({
        sql: "UPDATE players SET status = 'inactive' WHERE id = ?",
        args: [id],
      });

      return NextResponse.json({ deleted: true, soft: true });
    }

    // Hard delete: no game history
    await db.execute({
      sql: "DELETE FROM players WHERE id = ?",
      args: [id],
    });

    return NextResponse.json({ deleted: true, soft: false });
  } catch (error) {
    console.error("Error deleting player:", error);
    return NextResponse.json({ error: "Failed to delete player" }, { status: 500 });
  }
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
    notes: row.notes,
    created_at: row.created_at,
  };
}
