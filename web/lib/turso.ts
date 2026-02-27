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
    `CREATE TABLE IF NOT EXISTS game_transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES games(id)
    )`,
  ]);

  // Migration: add column for failed transcript display on watch
  try {
    await db.execute("ALTER TABLE games ADD COLUMN last_failed_transcript TEXT");
  } catch {
    // Column already exists
  }

  // Migration: add target score column for win probability calculations
  try {
    await db.execute("ALTER TABLE games ADD COLUMN target_score INTEGER");
  } catch {
    // Column already exists
  }

  // Migration: add scoring mode column (1s2s or 2s3s)
  try {
    await db.execute("ALTER TABLE games ADD COLUMN scoring_mode TEXT DEFAULT '1s2s'");
  } catch {
    // Column already exists
  }

  // Migration: add live_transcript column for watch display
  try {
    await db.execute("ALTER TABLE games ADD COLUMN live_transcript TEXT");
  } catch {
    // Column already exists
  }

  // Migration: add acted_on column to game_transcripts for parse-on-recognition tracking
  try {
    await db.execute("ALTER TABLE game_transcripts ADD COLUMN acted_on TEXT");
  } catch {
    // Column already exists
  }

  // Migration: add full_name column to players for disambiguation
  try {
    await db.execute("ALTER TABLE players ADD COLUMN full_name TEXT");
  } catch {
    // Column already exists
  }

  // Migration: add player registry columns for centralized player management
  try {
    await db.execute("ALTER TABLE players ADD COLUMN first_name TEXT");
  } catch {
    // Column already exists
  }

  try {
    await db.execute("ALTER TABLE players ADD COLUMN last_name TEXT");
  } catch {
    // Column already exists
  }

  try {
    await db.execute("ALTER TABLE players ADD COLUMN status TEXT DEFAULT 'active'");
  } catch {
    // Column already exists
  }

  try {
    await db.execute("ALTER TABLE players ADD COLUMN aliases TEXT");
  } catch {
    // Column already exists
  }

  try {
    await db.execute("ALTER TABLE players ADD COLUMN notes TEXT");
  } catch {
    // Column already exists
  }

  try {
    await db.execute("ALTER TABLE players ADD COLUMN last_played_date TEXT");
  } catch {
    // Column already exists
  }

  // Migration: add notes column to games for admin notes
  try {
    await db.execute("ALTER TABLE games ADD COLUMN notes TEXT");
  } catch {
    // Column already exists
  }

  // Migration: add groupme_user_id column for stable GroupMe matching
  try {
    await db.execute("ALTER TABLE players ADD COLUMN groupme_user_id TEXT");
  } catch {
    // Column already exists
  }

  // Backfill known full names from GroupMe data
  const knownFullNames: Record<string, string> = {
    "Addison P.": "Addison Peiroo",
    "Austin P.": "Austin Place",
    "Beau B.": "Beau Bromley",
    "Brandon K.": "Brandon Kinney",
    "Ed G.": "Ed G.",
    "Gage S.": "Gage Smith",
    "Garett H.": "Garett Hill",
    "Jackson T.": "Jackson Thies",
    "Jacob T.": "Jacob Taylor",
    "Joe M.": "Joe Mathews",
    "JC B.": "JC Bryan",
    "Tyler E.": "Tyler Engebretson",
    "Jon J.": "Jon Jester",
    "Parker D.": "Parker Dooly",
  };
  for (const [displayName, fullName] of Object.entries(knownFullNames)) {
    await db.execute({
      sql: "UPDATE players SET full_name = ? WHERE LOWER(name) = LOWER(?) AND full_name IS NULL",
      args: [fullName, displayName],
    });
  }

  // Migration: add assisted_event_id to link assists to the score they assisted
  try {
    await db.execute("ALTER TABLE game_events ADD COLUMN assisted_event_id INTEGER");
  } catch {
    // Column already exists
  }

  // Backfill: link assist events to the score event that immediately precedes them
  await db.execute(`
    UPDATE game_events SET assisted_event_id = (
      SELECT ge2.id FROM game_events ge2
      WHERE ge2.game_id = game_events.game_id
        AND ge2.event_type = 'score'
        AND ge2.created_at <= game_events.created_at
        AND ge2.id < game_events.id
      ORDER BY ge2.created_at DESC, ge2.id DESC
      LIMIT 1
    )
    WHERE event_type = 'assist' AND assisted_event_id IS NULL
  `);
}
