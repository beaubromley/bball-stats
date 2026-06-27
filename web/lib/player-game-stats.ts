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
  target_score: number | null;
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
  corrected_event_id: number | null;
  created_at: string;
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

// Walk score events chronologically, applying corrections, to find the
// maximum running deficit faced by the eventual winning team. Mirrors the
// logic in getGameLevelRecords (two-pass corrected_event_id resolution +
// fallback heuristic) so the rollup column matches what records.ts used to
// compute on the fly.
function maxWinnerDeficit(
  events: EventRow[],
  playerToTeam: Map<string, "A" | "B">,
  winningTeam: "A" | "B",
): number {
  const scores = events
    .filter((e) => e.event_type === "score")
    .map((e) => ({
      id: e.id,
      player_id: e.player_id,
      pv: e.point_value,
      created_at: e.created_at,
      team: playerToTeam.get(e.player_id),
    }))
    .filter((s) => s.team === "A" || s.team === "B")
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);

  const corrections = events
    .filter((e) => e.event_type === "correction")
    .map((e) => ({
      id: e.id,
      player_id: e.player_id,
      pv: e.point_value,
      corrected_event_id: e.corrected_event_id,
      created_at: e.created_at,
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);

  // Pass 1: trust corrected_event_id when it lands on a real score.
  // Pass 2: fall back to (player, opposite pv, earlier ts) heuristic.
  const undone = new Set<number>();
  const scoreIds = new Set(scores.map((s) => s.id));
  const remaining: typeof corrections = [];
  for (const c of corrections) {
    if (
      c.corrected_event_id !== null &&
      scoreIds.has(c.corrected_event_id) &&
      !undone.has(c.corrected_event_id)
    ) {
      undone.add(c.corrected_event_id);
    } else {
      remaining.push(c);
    }
  }
  for (const c of remaining) {
    const cands = scores
      .filter(
        (s) =>
          s.player_id === c.player_id &&
          s.pv === -c.pv &&
          s.created_at < c.created_at &&
          !undone.has(s.id),
      )
      .sort((a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id - a.id,
      );
    if (cands.length > 0) undone.add(cands[0].id);
  }

  let a = 0;
  let b = 0;
  let maxDef = 0;
  for (const s of scores) {
    if (undone.has(s.id)) continue;
    if (s.team === "A") a += s.pv;
    else b += s.pv;
    const winner = winningTeam === "A" ? a : b;
    const loser = winningTeam === "A" ? b : a;
    const def = loser - winner;
    if (def > maxDef) maxDef = def;
  }
  return maxDef;
}

export async function refreshGameStats(gameId: string): Promise<void> {
  const db = getDb();

  // 1. Game metadata
  const gameRes = await db.execute({
    sql: `SELECT id, status, winning_team, start_time, scoring_mode, target_score
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

  // 3. Events for this game (need created_at + corrected_event_id for the
  //    deficit walk; we still aggregate non-score events too).
  const eventsRes = await db.execute({
    sql: `SELECT id, player_id, event_type, point_value, corrected_event_id, created_at
          FROM game_events WHERE game_id = ?`,
    args: [gameId],
  });
  const events = eventsRes.rows as unknown as EventRow[];

  // 4. Build per-player aggregates. Initialize every roster member at zero
  //    so non-scoring players still get a row.
  const byPlayer = new Map<string, PerPlayerAgg>();
  const playerToTeam = new Map<string, "A" | "B">();
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
    playerToTeam.set(r.player_id, r.team);
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
  const losingScore = Math.min(teamAScore, teamBScore);
  const target = game.target_score ?? 11;

  // Effective game length for normalization. Most games are normalized to
  // winning_score / 11, which "stretches" each stat back to game-to-11
  // equivalents. But when the winning team clinches at target with a
  // 2-pointer they finish at target+1; that extra point is incidental
  // (the game was effectively over at target), so we DON'T dilute. Rule:
  //   if winner_score == target+1 AND loser_score < target-1 → treat as target
  //   otherwise → use the actual winning_score
  // This keeps real "longer than target" games (e.g. 14-11 comebacks)
  // normalized, while sparing the dozens of typical 12-7 / 12-8 games.
  const effectiveWinningScore =
    winningScore === target + 1 && losingScore < target - 1
      ? target
      : winningScore;
  const effectiveGames =
    game.status === "finished" ? (effectiveWinningScore || 11) / 11.0 : 1.0;

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

  // 7. Comeback metric (max deficit faced by the eventual winning team).
  //    Only meaningful for finished, decided games.
  const maxDef =
    game.status === "finished" && (game.winning_team === "A" || game.winning_team === "B")
      ? maxWinnerDeficit(events, playerToTeam, game.winning_team)
      : 0;

  // 8. Write each row with INSERT OR REPLACE (idempotent).
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
          was_game_mvp, max_winner_deficit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        maxDef,
      ],
    });
  }
}
