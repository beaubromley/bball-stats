/**
 * One-time migration to populate player registry
 * Run with: npx tsx scripts/migrate-player-registry.ts
 */

import { createClient } from "@libsql/client";

// Extract from parser.ts ALIASES map - inverted to map player names to their mishearing aliases
const VOICE_ALIASES: Record<string, string[]> = {
  gage: ["gauge", "gates"],
  beau: ["bow", "bo", "o"],
  ed: ["add"],
  jon: ["john", "don"],
  garett: ["garrett", "gareth", "jarrett"],
  brent: ["print", "brett"],
  austin: ["boston", "awesome", "austen"],
  addison: ["madison", "edison"],
  brandon: ["brendan", "brenton"],
  jackson: ["jaxon"],
  taylor: ["tailor"],
  tyler: ["tiler"],
  aj: ["a j", "jay"],
  james: ["jane", "chains"],
  mack: ["mac"],
  ty: ["tie", "thai"],
  jc: ["jesse", "jaycee"],
  bryson: ["bison"],
  ryan: ["brian"],
  david: ["dave"],
  parker: ["darker"],
  grant: ["grand"],
  colton: ["golden"],
};

async function migrate() {
  const url = process.env.TURSO_DATABASE_URL || "libsql://bball-stats-beaubromley.aws-us-east-2.turso.io";
  const authToken = process.env.TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzA2ODg1NDcsImlkIjoiMzAzMTljZWYtNTlmYy00YzJkLThjODAtNDJmY2YzZWI1YmI3IiwicmlkIjoiZGU1NWJmZmItMDY0NC00NDM2LWEwZmQtODI5YTU4NzNlODY1In0.aD6SggGksUEtVyjys7UCi5Si7X8PlqXL9SJZ1AgpbmKz6RRLSYl6aZG-C4WhllJdi36nc58hKJIt1I82OhYsBg";

  const db = createClient({ url, authToken });

  console.log("🔄 Starting player registry migration...\n");

  const { rows } = await db.execute("SELECT * FROM players");

  let migratedCount = 0;
  let skippedCount = 0;

  for (const player of rows) {
    // Check if already migrated (has first_name)
    if (player.first_name) {
      console.log(`⏭️  Skipping ${player.name} (already migrated)`);
      skippedCount++;
      continue;
    }

    let first: string, last: string;

    // Try to parse from full_name first
    if (player.full_name) {
      const parts = String(player.full_name).split(/\s+/);
      first = parts[0];
      last = parts.slice(1).join(" ") || parts[0]; // Fallback if single name
    } else {
      // Parse from display name "Beau B."
      const parts = String(player.name).split(/\s+/);
      first = parts[0];
      last = parts[1] || ""; // Might be just "Joe"
    }

    // Find aliases for this player
    const voiceName = first.toLowerCase();
    const aliases = VOICE_ALIASES[voiceName] || [];

    // Update player record
    await db.execute({
      sql: `UPDATE players
            SET first_name = ?,
                last_name = ?,
                aliases = ?,
                status = 'active',
                last_played_date = NULL
            WHERE id = ?`,
      args: [first, last, JSON.stringify(aliases), player.id],
    });

    const aliasesStr = aliases.length > 0 ? aliases.join(", ") : "(none)";
    console.log(`✓ ${player.name} → ${first} ${last}, aliases: ${aliasesStr}`);
    migratedCount++;
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   Migrated: ${migratedCount} players`);
  console.log(`   Skipped: ${skippedCount} players (already migrated)`);
  console.log(`   Total: ${rows.length} players\n`);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
