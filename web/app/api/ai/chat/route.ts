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

game_events(id INTEGER PK, game_id TEXT, player_id TEXT, event_type TEXT, point_value INTEGER, corrected_event_id INTEGER, raw_transcript TEXT, created_at DATETIME)
  -- event_type: 'score', 'correction', 'steal', 'block', 'assist'
  -- For scores: point_value is 1, 2, or 3. For corrections: negative point_value (undo).
  -- corrected_event_id references the score event that was undone.

game_transcripts(id INTEGER PK, game_id TEXT, raw_text TEXT, acted_on TEXT, created_at DATETIME)
  -- Voice recognition segments. acted_on is what the parser interpreted (e.g. "Beau B. +2") or null if unrecognized.

Key relationships:
- To get a player's scores: JOIN game_events ON player_id, filter event_type = 'score'
- To get team rosters: JOIN rosters ON game_id and player_id
- To calculate team scores: SUM point_value from game_events JOINed with rosters filtered by team
- Corrections should be excluded from stats (they represent undone plays)
- All timestamps are UTC. Central Time = UTC - 6 hours.
`;

const SYSTEM_PROMPT = `You are a basketball stats analyst for a pickup basketball league at the Rankin YMCA. You answer questions about player performance, game results, and trends by querying a SQLite database.

${DB_SCHEMA}

When the user asks a question:
1. Write a SQL query to answer it. Use only SELECT statements (read-only).
2. Return your response as JSON with this exact format:
{"sql": "SELECT ...", "explanation": "Brief explanation of what this query does"}

Rules:
- Only SELECT queries. Never INSERT, UPDATE, DELETE, DROP, or ALTER.
- Use player name (p.name) for display, not player_id.
- For win/loss records, use games.winning_team compared to rosters.team.
- Exclude corrections from point totals (event_type != 'correction').
- Keep queries efficient. Use JOINs, not subqueries where possible.
- If the question can't be answered from the database, return: {"sql": null, "explanation": "reason"}
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

async function callGeminiSummarize(question: string, rows: Record<string, unknown>[], explanation: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const prompt = `The user asked: "${question}"

The query explanation: ${explanation}

Query results (JSON):
${JSON.stringify(rows, null, 2)}

Write a brief, conversational answer to the user's question based on these results. Use player names, not IDs. Keep it concise — a few sentences max. If the data is empty, say so. Don't mention SQL or databases.`;

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
    let parsed: { sql: string | null; explanation: string };
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ answer: "I couldn't understand how to query that. Try rephrasing.", raw });
    }

    if (!parsed.sql) {
      return NextResponse.json({ answer: parsed.explanation });
    }

    // Safety: only allow SELECT
    const sqlUpper = parsed.sql.trim().toUpperCase();
    if (!sqlUpper.startsWith("SELECT")) {
      return NextResponse.json({ answer: "I can only run read-only queries." });
    }

    // Step 2: Execute the query
    const db = getDb();
    const result = await db.execute(parsed.sql);
    const rows = result.rows as Record<string, unknown>[];

    // Step 3: Summarize with Gemini
    const answer = await callGeminiSummarize(question, rows.slice(0, 50), parsed.explanation);

    return NextResponse.json({
      answer,
      sql: parsed.sql,
      rows: rows.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({
      answer: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
