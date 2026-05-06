// Maintainer of the player_game_stats rollup table.
//
// One function: refreshGameStats(gameId). It recomputes every player_game_stats
// row for that game from scratch by reading the game's metadata, roster, and
// events, and writes the rows via INSERT OR REPLACE. Idempotent — running it
// twice produces the same end state.
//
// Called from every site that mutates game_events / rosters / games (see the
// existing bustStatsCache() call sites). For active games during live recording
// this fires on every event, which is fine: ~8 INSERT OR REPLACE writes per
// scoring event is cheap.

import { getDb } from "./turso";
import { calculateFantasyPoints } from "./fantasy";

interface GameRow {
  id: string;
  status: string;
  winning_team: string | null;
  start_time: string;
  scoring_mode: string;
}

interface RosterRow {
  player_id: string;
  team: "A" | "B";
}

interface EventRow {
  id: number;
  player_id: string;
  event_type: "score" | "correction" | "assist" | "steal" | "block";
  point_value: number;
}

interface PerPlayerAgg {
  player_id: string;
  team: "A" | "B";
  points: number;
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
}

export async function refreshGameStats(gameId: string): Promise<void> {
  const db = getDb();

  // 1. Game metadata
  const gameRes = await db.execute({
    sql: `SELECT id, status, winning_team, start_time, scoring_mode
          FROM games WHERE id = ?`,
    args: [gameId],
  });
  if (gameRes.rows.length === 0) {
    // Game was deleted — clear any rollup rows for it.
    await db.execute({
      sql: "DELETE FROM player_game_stats WHERE game_id = ?",
      args: [gameId],
    });
    return;
  }
  const game = gameRes.rows[0] as unknown as GameRow;

  // 2. Roster
  const rosterRes = await db.execute({
    sql: "SELECT player_id, team FROM rosters WHERE game_id = ?",
    args: [gameId],
  });
  const roster = rosterRes.rows as unknown as RosterRow[];
  if (roster.length === 0) {
    // No roster yet — nothing to compute. Clear stale rows just in case.
    await db.execute({
      sql: "DELETE FROM player_game_stats WHERE game_id = ?",
      args: [gameId],
    });
    return;
  }

  // 3. Events for this game
  const eventsRes = await db.execute({
    sql: `SELECT id, player_id, event_type, point_value
          FROM game_events WHERE game_id = ?`,
    args: [gameId],
  });
  const events = eventsRes.rows as unknown as EventRow[];

  // 4. Build per-player aggregates. Initialize every roster member at zero
  //    so non-scoring players still get a row.
  const byPlayer = new Map<string, PerPlayerAgg>();
  for (const r of roster) {
    byPlayer.set(r.player_id, {
      player_id: r.player_id,
      team: r.team,
      points: 0,
      ones_made: 0,
      twos_made: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
    });
  }

  for (const e of events) {
    const agg = byPlayer.get(e.player_id);
    if (!agg) continue; // event for a player not on the roster — skip
    switch (e.event_type) {
      case "score":
        agg.points += e.point_value;
        if (e.point_value === 1) agg.ones_made += 1;
        else if (e.point_value === 2) agg.twos_made += 1;
        break;
      case "correction":
        // Corrections have negative point_value; they cancel an undone score.
        agg.points += e.point_value;
        if (e.point_value === -1) agg.ones_made -= 1;
        else if (e.point_value === -2) agg.twos_made -= 1;
        break;
      case "assist":
        agg.assists += 1;
        break;
      case "steal":
        agg.steals += 1;
        break;
      case "block":
        agg.blocks += 1;
        break;
    }
  }

  // 5. Team totals → plus/minus + effective_games normalization
  let teamAScore = 0;
  let teamBScore = 0;
  for (const a of byPlayer.values()) {
    if (a.team === "A") teamAScore += a.points;
    else teamBScore += a.points;
  }
  const winningScore = Math.max(teamAScore, teamBScore);
  // game-to-22 in 2s3s mode → 2.0 effective games. game-to-11 → 1.0.
  // Active games default to 1.0; finished games normalize to winning_score / 11.
  // Matches the legacy SQL exactly: COALESCE(winning_score, 11) / 11.0.
  // (No min cap — a finished game whose net winning score < 11, due to
  // unrecorded corrections or similar data issues, contributes < 1.0
  // effective games. That matches the prior behavior.)
  const effectiveGames =
    game.status === "finished" ? (winningScore || 11) / 11.0 : 1.0;

  // 6. Pick the game MVP using the same tiebreaker as lib/stats.ts:
  //    fantasy_points DESC, points DESC, assists DESC, player_id ASC.
  //    Only winning-team players are eligible (matches existing logic).
  let mvpPlayerId: string | null = null;
  if (game.status === "finished" && game.winning_team) {
    const winners = [...byPlayer.values()].filter(
      (a) => a.team === game.winning_team,
    );
    let best:
      | { player_id: string; fp: number; pts: number; asts: number }
      | null = null;
    for (const a of winners) {
      const fp = calculateFantasyPoints({
        points: a.points,
        assists: a.assists,
        steals: a.steals,
        blocks: a.blocks,
      });
      const cand = { player_id: a.player_id, fp, pts: a.points, asts: a.assists };
      if (
        !best ||
        cand.fp > best.fp ||
        (cand.fp === best.fp && cand.pts > best.pts) ||
        (cand.fp === best.fp && cand.pts === best.pts && cand.asts > best.asts) ||
        (cand.fp === best.fp &&
          cand.pts === best.pts &&
          cand.asts === best.asts &&
          cand.player_id < best.player_id)
      ) {
        best = cand;
      }
    }
    mvpPlayerId = best?.player_id ?? null;
  }

  // 7. Write each row with INSERT OR REPLACE (idempotent).
  for (const a of byPlayer.values()) {
    const teamScore = a.team === "A" ? teamAScore : teamBScore;
    const oppScore = a.team === "A" ? teamBScore : teamAScore;
    const won =
      game.status === "finished" && game.winning_team
        ? a.team === game.winning_team
          ? 1
          : 0
        : null;
    const fantasyPoints = calculateFantasyPoints({
      points: a.points,
      assists: a.assists,
      steals: a.steals,
      blocks: a.blocks,
    });
    const wasMvp = a.player_id === mvpPlayerId ? 1 : 0;

    await db.execute({
      sql: `
        INSERT OR REPLACE INTO player_game_stats (
          game_id, player_id, team, game_status, start_time, scoring_mode,
          won, points, ones_made, twos_made, assists, steals, blocks,
          fantasy_points, team_score, opp_score, plus_minus, effective_games,
          was_game_mvp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        gameId,
        a.player_id,
        a.team,
        game.status,
        game.start_time,
        game.scoring_mode,
        won,
        a.points,
        a.ones_made,
        a.twos_made,
        a.assists,
        a.steals,
        a.blocks,
        fantasyPoints,
        teamScore,
        oppScore,
        teamScore - oppScore,
        effectiveGames,
        wasMvp,
      ],
    });
  }
}
