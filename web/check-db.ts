import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function check() {
  const result = await db.execute("SELECT COUNT(*) as count FROM players");
  console.log("Total players:", result.rows[0].count);
  
  const sample = await db.execute("SELECT * FROM players LIMIT 5");
  console.log("\nSample players:");
  for (const row of sample.rows) {
    console.log(row);
  }
}

check().catch(console.error);
