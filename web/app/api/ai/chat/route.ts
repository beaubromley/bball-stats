import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { requireAuth } from "@/lib/auth";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const DB_SCHEMA = `
Tables in this SQLite database (Turso/LibSQL):

players(id TEXT PK, name TEXT UNIQUE, full_name TEXT, created_at DATETIME)
  -- name is display name like "Beau B.", full_name is "Beau Bromley"

games(id TEXT PK, location TEXT, start_time DATETIME, end_time DATETIME, status TEXT, winning_team TEXT, target_score INTEGER, scoring_mode TEXT, last_failed_transcript TEXT, live_transcript TEXT)
  -- status: 'active' or 'finished'. winning_team: 'A' or 'B'. scoring_mode: '1s2s' or '2s3s'. start_time is UTC.

rosters(game_id TEXT, player_id TEXT, team TEXT, PK(game_id, player_id))
  -- team: 'A' or 'B'. Links players to games.

game_events(id INTEGER PK, game_id TEXT, player_id TEXT, event_type TEXT, point_value INTEGER, corrected_event_id INTEGER, raw_transcript TEXT, created_at DATETIME, assisted_event_id INTEGER)
  -- event_type: 'score', 'correction', 'steal', 'block', 'assist'
  -- For scores: point_value is 1, 2, or 3. For corrections: negative point_value (undo).
  -- corrected_event_id references the score event that was undone.
  -- For assists: assisted_event_id references the score event that was assisted.

game_transcripts(id INTEGER PK, game_id TEXT, raw_text TEXT, acted_on TEXT, created_at DATETIME)
  -- Voice recognition segments. acted_on is what the parser interpreted (e.g. "Beau B. +2") or null if unrecognized.

Basketball context:
- This is pickup basketball at the Rankin YMCA. Games are typically 4v4, first to 11 or 15.
- scoring_mode '1s2s': inside shots = 1 point (point_value=1), outside/deep/three-pointers = 2 points (point_value=2)
- scoring_mode '2s3s': inside shots = 2 points (point_value=2), outside/deep/three-pointers = 3 points (point_value=3)
- "Deep", "from deep", "outside", "three", "downtown" all mean the higher point value shot (2 in 1s2s mode, 3 in 2s3s mode)
- "Bucket", "layup", "dunk", "floater" mean the lower point value shot (1 in 1s2s mode, 2 in 2s3s mode)
- Most games so far use 1s2s scoring. So point_value=1 is an inside shot, point_value=2 is an outside/deep shot.
- To find "deep" or "outside" shots: filter for the higher point_value. In 1s2s games, that's point_value=2. Check games.scoring_mode if needed.

Key relationships:
- To get a player's scores: JOIN game_events ON player_id, filter event_type = 'score'
- To get team rosters: JOIN rosters ON game_id and player_id
- To calculate team scores: SUM point_value from game_events JOINed with rosters filtered by team
- Corrections should be excluded from stats (they represent undone plays)
- To find assist-scorer pairs: JOIN assist events (via assisted_event_id) to the score event they assisted. The assist's player_id is the assister, the score's player_id is the scorer.
- When querying by player name, use LIKE '%name%' or match on p.name. Players are stored as "First L." (e.g. "Brandon K.") so searching for "Brandon" should use p.name LIKE 'Brandon%'.
- All timestamps are UTC. Central Time = UTC - 6 hours.
`;

const SYSTEM_PROMPT = `You are a basketball stats analyst for a pickup basketball league at the Rankin YMCA. You answer questions about player performance, game results, and trends by querying a SQLite database.

${DB_SCHEMA}

When the user asks a question:
1. Write one or more SQL queries to answer it thoroughly. Use CTEs (WITH clauses) for complex analysis.
2. Return your response as JSON with this exact format:
{"queries": [{"sql": "SELECT ...", "label": "Short label for this query"}], "explanation": "What these queries will show"}

For simple questions, use a single query. For complex questions, use multiple queries to show different angles.

Rules:
- Only SELECT queries (including WITH/CTE). Never INSERT, UPDATE, DELETE, DROP, or ALTER.
- Use player name (p.name) for display, not player_id.
- For win/loss records, use games.winning_team compared to rosters.team.
- Exclude corrections from point totals (event_type != 'correction').
- Use CTEs freely for complex analysis — readability matters more than brevity.
- Default to showing the top 5 results when ranking players. Use LIMIT 5 unless the user asks for all.
- Anticipate follow-up questions. If someone asks "who scores the most?", also show PPG, shooting splits, and games played — not just total points.
- When asked about a specific player, include context: their rank relative to others, trends, notable stats.
- If the question can't be answered from the database, return: {"queries": [], "explanation": "reason"}
- Return ONLY the JSON object, no markdown, no code fences.`;

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callGeminiSummarize(question: string, results: any, explanation: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const prompt = `The user asked: "${question}"

The query explanation: ${explanation}

Query results (JSON):
${JSON.stringify(results, null, 2)}

Write a thorough, conversational answer to the user's question based on these results. Guidelines:
- Use player first names naturally (e.g. "Brandon" not "Brandon K.")
- Highlight the key finding first, then provide supporting details
- Include relevant numbers and percentages
- Point out interesting patterns or surprises in the data
- If multiple queries were run, synthesize the findings into a cohesive narrative
- If data is empty, say so and suggest what might be wrong
- Don't mention SQL, databases, or queries
- Use line breaks for readability when covering multiple points`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!res.ok) throw new Error("Gemini summarize failed");
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  await initDb();
  const { question } = await req.json();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  try {
    // Step 1: Get SQL from Gemini
    const raw = await callGemini(question);
    let parsed: { queries?: { sql: string; label: string }[]; sql?: string; explanation: string };
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ answer: "I couldn't understand how to query that. Try rephrasing.", raw });
    }

    // Support both old format (single sql) and new format (queries array)
    const queries = parsed.queries || (parsed.sql ? [{ sql: parsed.sql, label: "Results" }] : []);

    if (queries.length === 0) {
      return NextResponse.json({ answer: parsed.explanation });
    }

    // Step 2: Execute all queries
    const db = getDb();
    const allResults: { label: string; sql: string; rows: Record<string, unknown>[] }[] = [];

    for (const q of queries) {
      const sqlUpper = q.sql.trim().toUpperCase();
      if (!sqlUpper.startsWith("SELECT") && !sqlUpper.startsWith("WITH")) continue;
      try {
        const result = await db.execute(q.sql);
        allResults.push({ label: q.label, sql: q.sql, rows: (result.rows as Record<string, unknown>[]).slice(0, 50) });
      } catch (sqlErr) {
        allResults.push({ label: q.label, sql: q.sql, rows: [{ error: String(sqlErr) }] });
      }
    }

    // Step 3: Summarize all results with Gemini
    const resultsForSummary = allResults.map((r) => ({
      label: r.label,
      data: r.rows.slice(0, 30),
    }));
    const answer = await callGeminiSummarize(question, resultsForSummary, parsed.explanation);

    return NextResponse.json({
      answer,
      sql: allResults.map((r) => `-- ${r.label}\n${r.sql}`).join("\n\n"),
      rows: allResults.length === 1 ? allResults[0].rows.slice(0, 20) : allResults.flatMap((r) => r.rows).slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({
      answer: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
