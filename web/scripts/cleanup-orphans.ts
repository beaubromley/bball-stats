/**
 * Verify and remove orphan/phantom players that have no game activity.
 * Run with: npx tsx scripts/cleanup-orphans.ts
 */

import { createClient } from "@libsql/client";

const ORPHAN_NAMES = [
  "Both", "Book", "Bo", "Beau", "Porter", "Kyah",
  "Rhett", "Shae", "C", "John B", "Get", "Hole",
];

async function cleanup() {
  const url = "libsql://bball-stats-beaubromley.aws-us-east-2.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzA2ODg1NDcsImlkIjoiMzAzMTljZWYtNTlmYy00YzJkLThjODAtNDJmY2YzZWI1YmI3IiwicmlkIjoiZGU1NWJmZmItMDY0NC00NDM2LWEwZmQtODI5YTU4NzNlODY1In0.aD6SggGksUEtVyjys7UCi5Si7X8PlqXL9SJZ1AgpbmKz6RRLSYl6aZG-C4WhllJdi36nc58hKJIt1I82OhYsBg";

  const db = createClient({ url, authToken });

  console.log("🔍 Checking orphan players...\n");

  // Find these players in the DB
  const placeholders = ORPHAN_NAMES.map(() => "?").join(", ");
  const { rows: players } = await db.execute({
    sql: `SELECT id, name, full_name FROM players WHERE name IN (${placeholders})`,
    args: ORPHAN_NAMES,
  });

  if (players.length === 0) {
    console.log("No matching players found in database.");
    return;
  }

  console.log(`Found ${players.length} matching players:\n`);

  const safeToDelete: { id: string; name: string }[] = [];
  const NOT_SAFE: { id: string; name: string; reason: string }[] = [];

  for (const player of players) {
    const id = String(player.id);
    const name = String(player.name);

    // Check rosters
    const { rows: rosterRows } = await db.execute({
      sql: `SELECT COUNT(*) as count FROM rosters WHERE player_id = ?`,
      args: [id],
    });
    const rosterCount = Number(rosterRows[0].count);

    // Check game_events
    const { rows: eventRows } = await db.execute({
      sql: `SELECT COUNT(*) as count FROM game_events WHERE player_id = ?`,
      args: [id],
    });
    const eventCount = Number(eventRows[0].count);

    if (rosterCount === 0 && eventCount === 0) {
      console.log(`  ✓ ${name} — 0 rosters, 0 events → SAFE TO DELETE`);
      safeToDelete.push({ id, name });
    } else {
      const reason = `${rosterCount} rosters, ${eventCount} events`;
      console.log(`  ⚠️ ${name} — ${reason} → NOT SAFE`);
      NOT_SAFE.push({ id, name, reason });
    }
  }

  // Check for names NOT found in DB
  const foundNames = players.map((p) => String(p.name));
  const notFound = ORPHAN_NAMES.filter((n) => !foundNames.includes(n));
  if (notFound.length > 0) {
    console.log(`\n  Not found in DB: ${notFound.join(", ")}`);
  }

  if (NOT_SAFE.length > 0) {
    console.log(`\n⚠️  ${NOT_SAFE.length} player(s) have game activity and will NOT be deleted:`);
    for (const p of NOT_SAFE) {
      console.log(`   - ${p.name}: ${p.reason}`);
    }
  }

  if (safeToDelete.length === 0) {
    console.log("\nNo players to delete.");
    return;
  }

  // Delete safe players
  console.log(`\n🗑️  Deleting ${safeToDelete.length} orphan player(s)...`);
  for (const player of safeToDelete) {
    await db.execute({
      sql: `DELETE FROM players WHERE id = ?`,
      args: [player.id],
    });
    console.log(`   Deleted: ${player.name}`);
  }

  console.log(`\n✅ Cleanup complete! Removed ${safeToDelete.length} orphan player(s).`);
}

cleanup().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
