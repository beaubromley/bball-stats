/**
 * One-time script to merge duplicate player records.
 * Run with: npx tsx scripts/merge-players.ts
 *
 * Merges:
 * - "Cole Garcia" → "Cole G."
 * - "Brent McCoy" → "Brent M."
 * - "Brent" → "Brent M."
 *
 * Also removes "Cole Garcia", "Brent McCoy", "Brent" from rosters (Games 6-10)
 * and replaces with "Cole G." and "Brent M." on the correct teams.
 */

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const MERGES = [
  { keep: "Cole G.", keepId: "4b4bfcbc-4cb8-4ef3-8cf8-bb907870649f", remove: ["Cole Garcia"], removeIds: ["5351658e-6fc8-4b0c-9de7-0ea0c5a15839"] },
  { keep: "Brent M.", keepId: "0af98c1a-4b84-4b35-86ba-342dbd9499f9", remove: ["Brent McCoy", "Brent"], removeIds: ["a0546b37-7024-41c8-bbc0-406f12977f78", "7b17a76b-6b45-471d-976a-5174b6b1d69f"] },
];

async function main() {
  for (const merge of MERGES) {
    console.log(`\nMerging ${merge.remove.join(", ")} → ${merge.keep}`);

    for (const removeId of merge.removeIds) {
      // Move all game_events from duplicate to canonical
      const evtResult = await db.execute({
        sql: "UPDATE game_events SET player_id = ? WHERE player_id = ?",
        args: [merge.keepId, removeId],
      });
      console.log(`  Events moved: ${evtResult.rowsAffected}`);

      // Move all roster entries: delete duplicate, add canonical if not exists
      const rosterRows = await db.execute({
        sql: "SELECT game_id, team FROM rosters WHERE player_id = ?",
        args: [removeId],
      });
      for (const row of rosterRows.rows) {
        const gameId = row.game_id as string;
        const team = row.team as string;
        // Check if canonical player already on this roster
        const existing = await db.execute({
          sql: "SELECT 1 FROM rosters WHERE game_id = ? AND player_id = ?",
          args: [gameId, merge.keepId],
        });
        if (existing.rows.length === 0) {
          await db.execute({
            sql: "INSERT INTO rosters (game_id, player_id, team) VALUES (?, ?, ?)",
            args: [gameId, merge.keepId, team],
          });
          console.log(`  Roster: added ${merge.keep} to game ${gameId.slice(0, 8)}... team ${team}`);
        }
        // Remove duplicate from roster
        await db.execute({
          sql: "DELETE FROM rosters WHERE game_id = ? AND player_id = ?",
          args: [gameId, removeId],
        });
        console.log(`  Roster: removed duplicate from game ${gameId.slice(0, 8)}...`);
      }

      // Delete the duplicate player record
      await db.execute({
        sql: "DELETE FROM players WHERE id = ?",
        args: [removeId],
      });
      console.log(`  Deleted player: ${removeId}`);
    }
  }

  // Update full_name for merged players
  await db.execute({
    sql: "UPDATE players SET full_name = ? WHERE id = ?",
    args: ["Cole Garcia", "4b4bfcbc-4cb8-4ef3-8cf8-bb907870649f"],
  });
  await db.execute({
    sql: "UPDATE players SET full_name = ? WHERE id = ?",
    args: ["Brent McCoy", "0af98c1a-4b84-4b35-86ba-342dbd9499f9"],
  });
  console.log("\nFull names updated.");

  // Verify
  const players = await db.execute("SELECT id, name, full_name FROM players WHERE name IN ('Cole G.', 'Brent M.', 'Cole Garcia', 'Brent McCoy', 'Brent')");
  console.log("\nRemaining players:");
  for (const p of players.rows) {
    console.log(`  ${p.name} (${p.id}) full_name: ${p.full_name}`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
