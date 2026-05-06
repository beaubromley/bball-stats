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
    // Without this, every NOT EXISTS (... corrected_event_id = ?) subquery
    // does a full scan of game_events. Verified: cuts that lookup from
    // ~510ms to ~150ms on the live DB.
    `CREATE INDEX IF NOT EXISTS idx_events_corrected ON game_events(corrected_event_id)`,
    // Functional index for case-insensitive player lookups. ensurePlayer
    // does WHERE LOWER(name) = LOWER(?) which previously full-scanned the
    // players table (~5.6M rows read across 153K calls last month).
    `CREATE INDEX IF NOT EXISTS idx_players_name_lower ON players(LOWER(name))`,
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

  // Migration: add groupme_user_id and groupme_name columns for stable GroupMe matching
  try {
    await db.execute("ALTER TABLE players ADD COLUMN groupme_user_id TEXT");
  } catch {
    // Column already exists
  }
  try {
    await db.execute("ALTER TABLE players ADD COLUMN groupme_name TEXT");
  } catch {
    // Column already exists
  }

  // Migration: add voice_name column for custom voice recognition name
  try {
    await db.execute("ALTER TABLE players ADD COLUMN voice_name TEXT");
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

  // Migration: season_awards for manually-set awards like MVP
  await db.execute(`
    CREATE TABLE IF NOT EXISTS season_awards (
      season INTEGER NOT NULL,
      award_type TEXT NOT NULL,
      player_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (season, award_type),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  // Migration: MVP voting lifecycle (one row per season; closed_at NULL = open)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mvp_voting (
      season INTEGER PRIMARY KEY,
      closed_at DATETIME
    )
  `);

  // Migration: MVP ballots, one per (season, voter)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mvp_votes (
      id TEXT PRIMARY KEY,
      season INTEGER NOT NULL,
      voter_player_id TEXT NOT NULL,
      pick_1_player_id TEXT NOT NULL,
      pick_2_player_id TEXT NOT NULL,
      pick_3_player_id TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(season, voter_player_id),
      FOREIGN KEY (voter_player_id) REFERENCES players(id),
      FOREIGN KEY (pick_1_player_id) REFERENCES players(id),
      FOREIGN KEY (pick_2_player_id) REFERENCES players(id),
      FOREIGN KEY (pick_3_player_id) REFERENCES players(id)
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_mvp_votes_season ON mvp_votes(season)`);

  // Per-player per-game rollup. Maintained by refreshGameStats() — every
  // write site that touches game_events / rosters / games for a given gameId
  // calls refreshGameStats(gameId), which recomputes that game's rows from
  // scratch (idempotent). Read-side queries aggregate over this table
  // instead of scanning the play-by-play.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_game_stats (
      game_id          TEXT    NOT NULL,
      player_id        TEXT    NOT NULL,
      team             TEXT    NOT NULL,
      game_status      TEXT    NOT NULL,
      start_time       DATETIME NOT NULL,
      scoring_mode     TEXT    NOT NULL,
      won              INTEGER,
      points           INTEGER NOT NULL,
      ones_made        INTEGER NOT NULL,
      twos_made        INTEGER NOT NULL,
      assists          INTEGER NOT NULL,
      steals           INTEGER NOT NULL,
      blocks           INTEGER NOT NULL,
      fantasy_points   INTEGER NOT NULL,
      team_score       INTEGER NOT NULL,
      opp_score        INTEGER NOT NULL,
      plus_minus       INTEGER NOT NULL,
      effective_games  REAL    NOT NULL,
      was_game_mvp     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (game_id, player_id),
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pgs_player ON player_game_stats(player_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pgs_status ON player_game_stats(game_status)`);

  // Stage-3 add: max running deficit faced by the eventual winner over the
  // course of the game (used for the "biggest comeback" record). One column
  // per row even though it's a per-game value — keeps the rollup schema
  // single-table and SUM/MAX queries trivial. Idempotent: skip if the
  // column already exists.
  try {
    await db.execute(`
      ALTER TABLE player_game_stats
      ADD COLUMN max_winner_deficit INTEGER NOT NULL DEFAULT 0
    `);
  } catch (err) {
    // SQLite throws "duplicate column name" if the column already exists.
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate column/i.test(msg)) throw err;
  }

  // NOTE: a one-shot UPDATE used to live here that backfilled assisted_event_id
  // on old assist rows. It was confirmed to have already populated all rows
  // (every assist now has the link set at insert time), but was still running
  // on every API request because initDb() is called from every route. Turso
  // analytics showed it accounted for ~75% of monthly row reads. Removed.
  // If we ever need to re-run that migration, it belongs in a one-off script,
  // not initDb().
}
