import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/turso";

const MIN_GAMES = 10;

interface EventRow {
  game_id: string;
  player_id: string;
  event_type: string;
  point_value: number;
}

interface RosterRow {
  game_id: string;
  player_id: string;
  team: string;
}

interface GameRow {
  id: string;
  winning_team: string | null;
  target_score: number | null;
}

/**
 * Reconstruct score progression for a game from its events and roster.
 * Returns array of { scoreA, scoreB } after each scoring play.
 */
function buildScoreProgression(
  events: EventRow[],
  rosterMap: Map<string, "A" | "B">
): { scoreA: number; scoreB: number }[] {
  let a = 0;
  let b = 0;
  const progression: { scoreA: number; scoreB: number }[] = [];

  for (const evt of events) {
    if (
      (evt.event_type === "score" || evt.event_type === "correction") &&
      evt.point_value !== 0
    ) {
      const team = rosterMap.get(evt.player_id);
      if (!team) continue;
      if (team === "A") a += evt.point_value;
      else b += evt.point_value;
      progression.push({ scoreA: a, scoreB: b });
    }
  }

  return progression;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb();
  const { id } = await params;
  const db = getDb();

  // 1. Count finished games to check minimum threshold
  const countResult = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM games WHERE status = 'finished'",
    args: [],
  });
  const totalFinished = Number(countResult.rows[0].cnt);

  if (totalFinished < MIN_GAMES) {
    return NextResponse.json({
      data: [],
      total_games_analyzed: totalFinished,
      min_games_required: MIN_GAMES,
      message: `Need at least ${MIN_GAMES} finished games (currently ${totalFinished})`,
    });
  }

  // 2. Get the target game info
  const gameResult = await db.execute({
    sql: "SELECT id, winning_team, target_score FROM games WHERE id = ?",
    args: [id],
  });
  if (gameResult.rows.length === 0) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  const targetGame = gameResult.rows[0] as unknown as GameRow;

  // 3. Get the target game's roster
  const rosterResult = await db.execute({
    sql: "SELECT player_id, team FROM rosters WHERE game_id = ?",
    args: [id],
  });
  const targetRoster = new Map<string, "A" | "B">();
  for (const row of rosterResult.rows) {
    targetRoster.set(row.player_id as string, row.team as "A" | "B");
  }

  // 4. Get the target game's events
  const eventsResult = await db.execute({
    sql: `SELECT game_id, player_id, event_type, point_value
          FROM game_events WHERE game_id = ? ORDER BY created_at ASC`,
    args: [id],
  });
  const targetEvents = eventsResult.rows as unknown as EventRow[];
  const targetProgression = buildScoreProgression(targetEvents, targetRoster);

  // Determine this game's target score
  let thisTarget = targetGame.target_score;
  if (!thisTarget && targetProgression.length > 0) {
    const last = targetProgression[targetProgression.length - 1];
    thisTarget = Math.max(last.scoreA, last.scoreB);
  }
  if (!thisTarget) thisTarget = 11; // fallback

  // 5. Fetch ALL finished games + their events + rosters (batch)
  const allGames = await db.execute({
    sql: "SELECT id, winning_team, target_score FROM games WHERE status = 'finished'",
    args: [],
  });

  const allEvents = await db.execute({
    sql: `SELECT ge.game_id, ge.player_id, ge.event_type, ge.point_value
          FROM game_events ge
          JOIN games g ON ge.game_id = g.id
          WHERE g.status = 'finished'
          ORDER BY ge.game_id, ge.created_at ASC`,
    args: [],
  });

  const allRosters = await db.execute({
    sql: `SELECT r.game_id, r.player_id, r.team
          FROM rosters r
          JOIN games g ON r.game_id = g.id
          WHERE g.status = 'finished'`,
    args: [],
  });

  // 6. Index events and rosters by game_id
  const eventsByGame = new Map<string, EventRow[]>();
  for (const row of allEvents.rows) {
    const gid = row.game_id as string;
    if (!eventsByGame.has(gid)) eventsByGame.set(gid, []);
    eventsByGame.get(gid)!.push(row as unknown as EventRow);
  }

  const rostersByGame = new Map<string, Map<string, "A" | "B">>();
  for (const row of allRosters.rows) {
    const gid = row.game_id as string;
    if (!rostersByGame.has(gid)) rostersByGame.set(gid, new Map());
    rostersByGame.get(gid)!.set(row.player_id as string, row.team as "A" | "B");
  }

  // 7. Build the historical lookup table
  // Key: "leaderRemaining-trailerRemaining" → { wins (leader won), total }
  const lookup = new Map<string, { wins: number; total: number }>();

  for (const game of allGames.rows as unknown as GameRow[]) {
    const events = eventsByGame.get(game.id);
    const roster = rostersByGame.get(game.id);
    if (!events || !roster || !game.winning_team) continue;

    const progression = buildScoreProgression(events, roster);
    if (progression.length === 0) continue;

    // Determine effective target for this game
    let effectiveTarget = game.target_score;
    if (!effectiveTarget) {
      const last = progression[progression.length - 1];
      effectiveTarget = Math.max(last.scoreA, last.scoreB);
    }
    if (!effectiveTarget) continue;

    // Walk through the score progression
    for (const { scoreA, scoreB } of progression) {
      const aRemaining = effectiveTarget - scoreA;
      const bRemaining = effectiveTarget - scoreB;

      if (aRemaining < 0 || bRemaining < 0) continue; // score went past target (shouldn't happen)

      let leaderRemaining: number;
      let trailerRemaining: number;
      let leaderIsA: boolean;

      if (scoreA > scoreB) {
        leaderRemaining = aRemaining;
        trailerRemaining = bRemaining;
        leaderIsA = true;
      } else if (scoreB > scoreA) {
        leaderRemaining = bRemaining;
        trailerRemaining = aRemaining;
        leaderIsA = false;
      } else {
        // Tied — store as "tied with X remaining"
        const key = `tied-${aRemaining}`;
        if (!lookup.has(key)) lookup.set(key, { wins: 0, total: 0 });
        const entry = lookup.get(key)!;
        entry.total++;
        // For tied states, count if team A won (arbitrary baseline)
        if (game.winning_team === "A") entry.wins++;
        continue;
      }

      const key = `${leaderRemaining}-${trailerRemaining}`;
      if (!lookup.has(key)) lookup.set(key, { wins: 0, total: 0 });
      const entry = lookup.get(key)!;
      entry.total++;
      // Did the leader at this point win?
      const leaderWon = leaderIsA
        ? game.winning_team === "A"
        : game.winning_team === "B";
      if (leaderWon) entry.wins++;
    }
  }

  // 8. Map the target game's progression through the lookup
  const data: {
    play: number;
    score_a: number;
    score_b: number;
    win_prob_a: number;
    sample_size: number | null;
  }[] = [
    { play: 0, score_a: 0, score_b: 0, win_prob_a: 0.5, sample_size: null },
  ];

  for (let i = 0; i < targetProgression.length; i++) {
    const { scoreA, scoreB } = targetProgression[i];
    const aRemaining = thisTarget - scoreA;
    const bRemaining = thisTarget - scoreB;
    let winProbA: number;
    let sampleSize: number | null = null;

    // Final state: game is over
    if (aRemaining <= 0) {
      winProbA = 1.0;
    } else if (bRemaining <= 0) {
      winProbA = 0.0;
    } else if (scoreA === scoreB) {
      // Tied
      const key = `tied-${aRemaining}`;
      const entry = lookup.get(key);
      if (entry && entry.total >= 3) {
        winProbA = entry.wins / entry.total;
        sampleSize = entry.total;
      } else {
        winProbA = 0.5;
      }
    } else if (scoreA > scoreB) {
      // Team A leading
      const key = `${aRemaining}-${bRemaining}`;
      const entry = lookup.get(key);
      if (entry && entry.total >= 3) {
        winProbA = entry.wins / entry.total; // leader win rate = team A win rate
        sampleSize = entry.total;
      } else {
        // Fallback: simple ratio based on points remaining
        winProbA = bRemaining / (aRemaining + bRemaining);
      }
    } else {
      // Team B leading
      const key = `${bRemaining}-${aRemaining}`;
      const entry = lookup.get(key);
      if (entry && entry.total >= 3) {
        winProbA = 1 - entry.wins / entry.total; // leader win rate flipped
        sampleSize = entry.total;
      } else {
        winProbA = bRemaining / (aRemaining + bRemaining);
      }
    }

    data.push({
      play: i + 1,
      score_a: scoreA,
      score_b: scoreB,
      win_prob_a: Math.round(winProbA * 1000) / 1000, // 3 decimal places
      sample_size: sampleSize,
    });
  }

  return NextResponse.json({
    data,
    total_games_analyzed: totalFinished,
  });
}
