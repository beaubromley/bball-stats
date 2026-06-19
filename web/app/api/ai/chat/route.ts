import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { requireAuth } from "@/lib/auth";

// Model rotation: try in order, fall through on 429/quota errors.
// Smartest models first for SQL (needs reasoning); cheapest first for
// summarization (rewording is easy, save the smart quota for SQL).
const SQL_MODELS = [
  "gemini-3-flash",        // 5 RPD — smartest free tier
  "gemini-2.5-flash",      // 10 RPD — current default
  "gemini-3-flash-lite",   // 15 RPD — fallback, may struggle on complex CTEs
  "gemini-2.5-flash-lite", // 10 RPD — last-resort fallback
];

const SUMMARY_MODELS = [
  "gemini-3-flash-lite",   // 15 RPD — highest allowance, fine for prose
  "gemini-2.5-flash-lite", // 10 RPD
  "gemini-2.5-flash",      // 10 RPD
  "gemini-3-flash",        // 5 RPD — rarely need to reach this
];

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  // Optional: the JSON the model returned for this user question's SQL step.
  // If present, used instead of `text` when feeding history into the SQL call
  // so the model sees its prior output in the expected format.
  sqlStepOutput?: string;
}

const DB_SCHEMA = `
Tables in this SQLite database (Turso/LibSQL):

players(
  id TEXT PK,
  name TEXT NOT NULL,         -- display name, "First L." e.g. "Beau B."
  full_name TEXT,             -- "Beau Bromley"
  first_name TEXT,
  last_name TEXT,
  status TEXT,                -- 'active' | 'inactive'
  aliases TEXT,               -- comma-separated voice aliases
  notes TEXT,
  last_played_date TEXT,      -- 'YYYY-MM-DD' in Central Time
  groupme_user_id TEXT,
  groupme_name TEXT,
  voice_name TEXT,            -- short first-name used by voice parser
  created_at DATETIME
)

games(
  id TEXT PK,
  location TEXT,
  start_time DATETIME,        -- UTC
  end_time DATETIME,          -- UTC, null while active
  status TEXT,                -- 'active' | 'finished'
  winning_team TEXT,          -- 'A' | 'B' | null if active
  target_score INTEGER,       -- usually 11
  scoring_mode TEXT,          -- '1s2s' (default, almost everything) or '2s3s'
  last_failed_transcript TEXT,
  live_transcript TEXT,
  notes TEXT
)

rosters(game_id TEXT, player_id TEXT, team TEXT NOT NULL, PK(game_id, player_id))
  -- team: 'A' or 'B'. Each finished game has 4-5 players per side.

game_events(
  id INTEGER PK AUTOINCREMENT,
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  event_type TEXT NOT NULL,   -- 'score' | 'correction' | 'steal' | 'block' | 'assist'
  point_value INTEGER NOT NULL,
  corrected_event_id INTEGER, -- the score event this correction is undoing
  assisted_event_id INTEGER,  -- the score event this assist set up
  raw_transcript TEXT,
  created_at DATETIME
)
  -- For 'score' events: point_value is 1, 2, or 3.
  -- For 'correction' events: point_value is NEGATIVE (e.g. -1, -2) and the
  --   original 'score' row is NOT deleted. So real totals require summing
  --   BOTH 'score' AND 'correction' events together.
  -- 'steal', 'block', 'assist' events all have point_value=0 and are never
  --   corrected.

game_transcripts(id INTEGER PK, game_id TEXT, raw_text TEXT, acted_on TEXT, created_at DATETIME)
  -- Voice recognition segments. acted_on is what the parser interpreted
  -- (e.g. "Beau B. +2") or NULL if unrecognized.

player_game_stats(
  game_id TEXT, player_id TEXT, PK(game_id, player_id),
  team TEXT NOT NULL,          -- 'A' | 'B'
  game_status TEXT NOT NULL,   -- 'active' | 'finished'
  start_time DATETIME NOT NULL,
  scoring_mode TEXT NOT NULL,
  won INTEGER,                 -- 1 if this player's team won, 0 if lost
  points INTEGER NOT NULL,         -- net points including corrections
  ones_made INTEGER NOT NULL,      -- net 1-pointers
  twos_made INTEGER NOT NULL,      -- net 2-pointers
  assists INTEGER NOT NULL,
  steals INTEGER NOT NULL,
  blocks INTEGER NOT NULL,
  fantasy_points INTEGER NOT NULL, -- points + assists + steals + blocks
  team_score INTEGER NOT NULL,     -- final score of this player's team
  opp_score INTEGER NOT NULL,
  plus_minus INTEGER NOT NULL,     -- team_score - opp_score
  effective_games REAL NOT NULL,   -- 1.0 for full games, partials are <1
  was_game_mvp INTEGER NOT NULL,   -- 1 if this player was the game's MVP
  max_winner_deficit INTEGER NOT NULL  -- biggest deficit the winning team ever climbed back from in this game
)
  -- IMPORTANT: This is a maintained rollup. For most stat questions
  -- (totals, averages, win%, MVP counts, plus/minus), query this table
  -- instead of reconstructing from game_events. It already accounts for
  -- corrections. Only drop down to game_events when you need granular
  -- play-by-play data (timestamps, deep shots, assists-by-shot, etc.).

mvp_voting(season INTEGER PK, closed_at DATETIME)
  -- Voting window per season. closed_at NULL = voting still open.

mvp_votes(
  id TEXT PK, season INTEGER NOT NULL,
  voter_player_id TEXT NOT NULL,
  pick_1_player_id TEXT NOT NULL,
  pick_2_player_id TEXT NOT NULL,
  pick_3_player_id TEXT NOT NULL,
  ip_address TEXT, user_agent TEXT, explanation TEXT,
  created_at DATETIME
)
  -- 5-3-1 ballot weighting by convention (1st place = 5 pts, 2nd = 3, 3rd = 1).

season_awards(
  season INTEGER, award_type TEXT, PK(season, award_type),
  player_id TEXT NOT NULL,
  created_at DATETIME, updated_at DATETIME
)
  -- award_type values include 'mvp', 'defensive_player', etc.

Basketball context:
- Pickup basketball at the Rankin YMCA. Usually 4v4 or 5v5, first team to 11.
- scoring_mode '1s2s' (default, ~all games so far): inside = 1 pt, deep/outside = 2 pts.
- scoring_mode '2s3s' (rare): inside = 2 pts, deep/outside = 3 pts.
- "Deep / outside / three / downtown" = the higher point value shot.
- "Bucket / layup / dunk / floater" = the lower point value shot.
- Fantasy points formula: points + assists + steals + blocks (1 pt each, no multipliers).
- Game MVP = highest fantasy_points on the WINNING team, with deterministic tiebreaks (fp DESC, points DESC, assists DESC, player_id ASC). Already pre-computed in player_game_stats.was_game_mvp.

Seasons:
- One season = 82 finished games (NBA convention). Ordered chronologically by start_time.
- For "this season" or "Season N" filters, take finished games ranked by start_time and pick rows ((N-1)*82+1) .. (N*82). When in doubt, default to the most recent season for "this season" questions.
- "S2 G14" means Season 2, the 14th finished game in that season.

Derived concepts (no special tables — computed from the rollup):
- Strength of Schedule index: average opponent pre-game expected win%, on a 0-100 scale where 50 = neutral. Higher = tougher schedule. Built from a logistic fit on (delta-team-FPG → A-won) pairs. If asked, you can ballpark by comparing a player's teammates' FPG to their opponents' FPG, but the canonical numbers come from the /api/strength-of-schedule endpoint, not direct SQL.
- Pre-game matchup predictor: same logistic. Inputs are each team's avg pre-game FPG.

Key relationships and gotchas:
- Player rollup stats: PREFER player_game_stats over game_events for totals, averages, win%, MVP, plus/minus. It's correct, accounts for corrections, and is way simpler.
- When you DO use game_events: ALWAYS sum point_value over event_type IN ('score', 'correction') together. Never filter event_type = 'score' alone — undone scores would be double-counted.
- Counting makes from raw events: COUNT(*) FILTER score events MINUS COUNT(*) FILTER correction events at the matching point_value.
- Steals / blocks / assists: filter event_type to the single value. They're never corrected.
- Assist-scorer pairs: JOIN assist events to the score event via assisted_event_id. The assist's player_id is the assister, the score's player_id is the scorer.
- Player name search: names are "First L." (e.g. "Brandon K."). Use p.name LIKE 'Brandon%' for first-name lookups; full match works for "Beau B."
- All timestamps are UTC. Central Time = UTC - 6 hours. To display a date in CT: date(start_time, '-6 hours').
- "Today" = today in CT, not UTC. Use date('now', '-6 hours') for the CT current date.
`;

const SYSTEM_PROMPT = `You are a basketball stats analyst for a pickup basketball league at the Rankin YMCA. You answer questions about player performance, game results, and trends by querying a SQLite database.

${DB_SCHEMA}

When the user asks a question:
1. Write one or more SQL queries to answer it thoroughly. Use CTEs (WITH clauses) for complex analysis.
2. Return your response as JSON with this exact format:
{"queries": [{"sql": "SELECT ...", "label": "Short label for this query"}], "explanation": "What these queries will show"}

For simple questions, use a single query. For complex questions, use multiple queries to show different angles.

SQLite dialect (CRITICAL — this is SQLite via Turso/libSQL, NOT BigQuery, Snowflake, Postgres, or DuckDB):
- DO NOT use QUALIFY. SQLite has no QUALIFY clause and the parser will reject it.
  Wrong:  SELECT ... QUALIFY ROW_NUMBER() OVER (PARTITION BY x ORDER BY y) = 1
  Right:  WITH ranked AS (
              SELECT ..., ROW_NUMBER() OVER (PARTITION BY x ORDER BY y) AS rn FROM ...
          )
          SELECT * FROM ranked WHERE rn = 1
- DO NOT use FULL OUTER JOIN or RIGHT JOIN. Use LEFT JOIN (reverse table order if needed),
  or LEFT JOIN + UNION + LEFT JOIN to simulate FULL OUTER.
- Window functions cannot be used in WHERE/HAVING — wrap them in a CTE and filter outside.
- Date/time: use strftime('%Y-%m-%d', col) and date(col, '-6 hours'). DO NOT use DATE_TRUNC,
  DATEPART, EXTRACT, or AT TIME ZONE.
- String concat: use ||, not +.
- Aggregating strings: use group_concat(...), not STRING_AGG / ARRAY_AGG.
- Booleans: SQLite stores 0/1 integers — never compare to TRUE/FALSE literals.
- LIMIT goes at the very end of the outermost query — never TOP N.
- DO NOT use NULLS FIRST / NULLS LAST. SQLite's default is NULLS FIRST for ASC; if you need
  the opposite, sort by (col IS NULL), col.
- DO NOT use LATERAL joins.

Rules:
- Only SELECT queries (including WITH/CTE). Never INSERT, UPDATE, DELETE, DROP, or ALTER.
- Use player name (p.name) for display, not player_id.
- For win/loss records, use games.winning_team compared to rosters.team.
- For point totals, ALWAYS include both 'score' and 'correction' events and use SUM(point_value). Corrections have negative values that cancel undone scores. Never filter to event_type = 'score' alone.
- Use CTEs freely for complex analysis — readability matters more than brevity.
- Default to showing the top 5 results when ranking players. Use LIMIT 5 unless the user asks for all.
- Anticipate follow-up questions. If someone asks "who scores the most?", also show PPG, shooting splits, and games played — not just total points.
- When asked about a specific player, include context: their rank relative to others, trends, notable stats.
- If the user asks a follow-up that references an earlier question (e.g. "what about just this season" or "show me more"), use the conversation history for context.
- If the question can't be answered from the database, return: {"queries": [], "explanation": "reason"}
- Return ONLY the JSON object, no markdown, no code fences.`;

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig?: { temperature?: number };
}

async function callGeminiWithRotation(
  models: string[],
  body: GeminiRequestBody,
  // Optional validator. Return true if the response text is usable; false to
  // fall through to the next model (e.g. for SQL step, reject unparseable JSON).
  validate?: (text: string) => boolean
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const errors: string[] = [];
  for (const model of models) {
    try {
      const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        // If validator rejects (e.g. unparseable JSON), try next model
        if (validate && !validate(text)) {
          errors.push(`${model}: invalid response format`);
          continue;
        }
        if (!text) {
          errors.push(`${model}: empty response`);
          continue;
        }
        return { text, model };
      }

      // Rate-limit or quota: fall through to next model
      const errText = await res.text();
      const isQuotaError =
        res.status === 429 ||
        (res.status === 403 && /quota|rate/i.test(errText)) ||
        (res.status === 400 && /quota/i.test(errText));

      if (isQuotaError) {
        errors.push(`${model}: ${res.status} (quota)`);
        continue;
      }

      // Hard error (500, model unavailable, etc) — fall through anyway
      errors.push(`${model}: ${res.status} ${errText.slice(0, 120)}`);
      continue;
    } catch (err) {
      // Network error, timeout, etc — try next model
      errors.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }
  throw new Error(`All models failed: ${errors.join(" | ")}`);
}

function tryParseSqlJson(text: string): { queries?: { sql: string; label: string }[]; sql?: string; explanation: string } | null {
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.explanation !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

// Convert chat history to Gemini `contents` format.
// For SQL step, we want prior `model` turns to look like the JSON we expect back.
function buildSqlContents(history: ChatMessage[], question: string): GeminiContent[] {
  const contents: GeminiContent[] = [];
  // Keep only the last 8 messages to bound context size
  const trimmed = history.slice(-8);
  for (const msg of trimmed) {
    if (msg.role === "user") {
      contents.push({ role: "user", parts: [{ text: msg.text }] });
    } else {
      // Prefer the original JSON output so the model sees its prior format
      contents.push({
        role: "model",
        parts: [{ text: msg.sqlStepOutput || msg.text }],
      });
    }
  }
  contents.push({ role: "user", parts: [{ text: question }] });
  return contents;
}

async function callGeminiSQL(
  question: string,
  history: ChatMessage[]
): Promise<{ text: string; model: string }> {
  return callGeminiWithRotation(
    SQL_MODELS,
    {
      contents: buildSqlContents(history, question),
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.1 },
    },
    // Reject responses that aren't valid JSON in our expected shape
    (text) => tryParseSqlJson(text) !== null,
  );
}

// One-shot repair pass: when the first SQL attempt fails, send the failed
// SQL + error back to Gemini and ask for a fix. The model's prompt already
// covers SQLite dialect, but seeing the actual parser error usually nails
// the specific issue (e.g. "QUALIFY not supported"). Returns null if no
// repaired JSON could be parsed.
async function callGeminiSqlRepair(
  question: string,
  failed: { label: string; sql: string; error: string }[],
): Promise<{ text: string; model: string } | null> {
  const failureSummary = failed
    .map(
      (f, i) =>
        `Query ${i + 1} (${f.label}):\nSQL:\n${f.sql}\n\nError:\n${f.error}`,
    )
    .join("\n\n---\n\n");

  const repairPrompt = `Your previous SQL failed against the SQLite/Turso database. Read the error(s) and return a corrected version. Common causes: using QUALIFY (not supported in SQLite — wrap in a CTE and filter on the row_number column), FULL OUTER JOIN, RIGHT JOIN, DATE_TRUNC, or a window function in WHERE.

Original question: "${question}"

${failureSummary}

Return the same JSON shape as before:
{"queries": [{"sql": "...", "label": "..."}], "explanation": "..."}
Return ONLY the JSON object, no markdown, no code fences.`;

  try {
    return await callGeminiWithRotation(
      SQL_MODELS,
      {
        contents: [{ role: "user", parts: [{ text: repairPrompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.1 },
      },
      (text) => tryParseSqlJson(text) !== null,
    );
  } catch {
    return null;
  }
}

async function callGeminiSummarize(
  question: string,
  results: unknown,
  explanation: string,
  history: ChatMessage[]
): Promise<{ text: string; model: string }> {
  const summaryInstruction = `You are a basketball stats analyst talking to a friend in the group chat. Answer casually and briefly — like texting, not writing an essay.

Guidelines:
- Use first names only (e.g. "Addison" not "Addison P.")
- Lead with the answer, keep it short and punchy
- Use actual numbers but don't over-explain them
- No markdown formatting (no **bold**, no *italics*, no bullet points). Just plain text.
- No exclamation marks on stats, no "impressive" or "standout" or "highlighting"
- Never mention game IDs, UUIDs, UTC times, scoring modes, or technical details
- Refer to games by season/game number (S1 G42) if relevant, never by ID
- Don't say "based on the data" or "according to the records"
- If it's a close race or interesting comparison, mention it naturally
- If data is empty, just say you don't have enough games for that yet
- Don't mention SQL, databases, or queries
- Keep it to 2-3 sentences max unless the question really needs more
- Reference prior turns naturally if the user asked a follow-up`;

  const prompt = `The user just asked: "${question}"

Query explanation: ${explanation}

Query results (JSON):
${JSON.stringify(results, null, 2)}

Reply casually following the guidelines.`;

  // Build contents including prior conversation for natural follow-ups
  const contents: GeminiContent[] = [];
  const trimmed = history.slice(-8);
  for (const msg of trimmed) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.text }],
    });
  }
  contents.push({ role: "user", parts: [{ text: prompt }] });

  return callGeminiWithRotation(SUMMARY_MODELS, {
    contents,
    systemInstruction: { parts: [{ text: summaryInstruction }] },
    generationConfig: { temperature: 0.3 },
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  await initDb();
  const body = await req.json();
  const question: string = body?.question;
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  try {
    // Step 1: Get SQL from Gemini (validator ensures only parseable responses return)
    const { text: raw, model: sqlModel } = await callGeminiSQL(question, history);
    const parsed = tryParseSqlJson(raw);
    if (!parsed) {
      return NextResponse.json({
        answer: "I couldn't understand how to query that. Try rephrasing.",
        raw,
        modelUsed: sqlModel,
      });
    }

    // Support both old format (single sql) and new format (queries array)
    const queries = parsed.queries || (parsed.sql ? [{ sql: parsed.sql, label: "Results" }] : []);

    if (queries.length === 0) {
      return NextResponse.json({
        answer: parsed.explanation,
        sqlStepOutput: raw,
        modelUsed: sqlModel,
      });
    }

    // Step 2: Execute all queries
    const db = getDb();

    type QueryResult = { label: string; sql: string; rows: Record<string, unknown>[]; error?: string };
    async function runAll(qs: { sql: string; label: string }[]): Promise<QueryResult[]> {
      const out: QueryResult[] = [];
      for (const q of qs) {
        const sqlUpper = q.sql.trim().toUpperCase();
        if (!sqlUpper.startsWith("SELECT") && !sqlUpper.startsWith("WITH")) continue;
        try {
          const result = await db.execute(q.sql);
          out.push({
            label: q.label,
            sql: q.sql,
            rows: (result.rows as Record<string, unknown>[]).slice(0, 50),
          });
        } catch (sqlErr) {
          const errStr = String(sqlErr);
          out.push({ label: q.label, sql: q.sql, rows: [{ error: errStr }], error: errStr });
        }
      }
      return out;
    }

    let allResults = await runAll(queries);
    let repairUsed: string | null = null;

    // Step 2b: One-shot repair if any query failed. Send the failed SQL + the
    // parser error back to Gemini and re-execute. This catches dialect mistakes
    // (QUALIFY, FULL OUTER JOIN, etc.) that the model can fix once it sees the
    // actual error message.
    const failures = allResults.filter((r) => r.error);
    if (failures.length > 0) {
      const repaired = await callGeminiSqlRepair(
        question,
        failures.map((f) => ({ label: f.label, sql: f.sql, error: f.error! })),
      );
      if (repaired) {
        const repairedParsed = tryParseSqlJson(repaired.text);
        const repairedQueries =
          repairedParsed?.queries ||
          (repairedParsed?.sql ? [{ sql: repairedParsed.sql, label: "Results" }] : []);
        if (repairedQueries.length > 0) {
          const retry = await runAll(repairedQueries);
          // Only swap in the repaired results if they actually improved things
          // (i.e. fewer errors). Otherwise keep the original failure for context.
          const retryFailures = retry.filter((r) => r.error).length;
          if (retryFailures < failures.length) {
            allResults = retry;
            repairUsed = repaired.model;
          }
        }
      }
    }

    // Step 3: Summarize all results with Gemini
    const resultsForSummary = allResults.map((r) => ({
      label: r.label,
      data: r.rows.slice(0, 30),
    }));
    const { text: answer, model: summaryModel } = await callGeminiSummarize(
      question,
      resultsForSummary,
      parsed.explanation,
      history,
    );

    return NextResponse.json({
      answer,
      sql: allResults.map((r) => `-- ${r.label}\n${r.sql}`).join("\n\n"),
      rows: allResults.length === 1 ? allResults[0].rows.slice(0, 20) : allResults.flatMap((r) => r.rows).slice(0, 20),
      sqlStepOutput: raw,
      modelUsed: repairUsed
        ? `${sqlModel} → repair:${repairUsed} → ${summaryModel}`
        : `${sqlModel} → ${summaryModel}`,
    });
  } catch (err) {
    return NextResponse.json({
      answer: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
