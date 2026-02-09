import { createClient, type Client } from "@libsql/client";

let client: Client;

export function getDb(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error("TURSO_DATABASE_URL environment variable is required");
    }

    client = createClient({
      url,
      authToken,
    });
  }
  return client;
}

export async function initDb() {
  const db = getDb();

  await db.batch([
    `CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      location TEXT,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      status TEXT DEFAULT 'active',
      winning_team TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rosters (
      game_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      team TEXT NOT NULL,
      PRIMARY KEY (game_id, player_id),
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )`,
    `CREATE TABLE IF NOT EXISTS game_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      point_value INTEGER NOT NULL,
      corrected_event_id INTEGER,
      raw_transcript TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_events_player ON game_events(player_id, event_type)`,
    `CREATE INDEX IF NOT EXISTS idx_events_game ON game_events(game_id, created_at)`,
  ]);
}
