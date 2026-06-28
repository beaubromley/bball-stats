import { unstable_cache } from "next/cache";
import { getDb, initDb } from "./turso";
import { TAG_STATS } from "./cache-tags";
import { getSeasonGameIds } from "./stats";

export interface ClutchEntry {
  player_id: string;
  name: string;
  /** Games this player was rostered in where clutch time occurred. */
  clutch_games: number;
  clutch_pts: number;
  clutch_ast: number;
  clutch_stl: number;
  clutch_blk: number;
  clutch_fp: number;
  /** Clutch fantasy points per clutch game, 2dp. */
  clutch_fp_pg: number;
}

interface EventRow {
  game_id: string;
  player_id: string;
  event_type: string;
  point_value: number;
  corrected_event_id: number | null;
  created_at: string;
  id: number;
}

interface RosterRow {
  game_id: string;
  player_id: string;
}

interface GameRow {
  id: string;
  target_score: number | null;
}

interface PlayerNameRow {
  id: string;
  name: string;
}

/**
 * A play is "clutch" if AT THE MOMENT of the event:
 *   • the leading team's score ≥ target - 2, AND
 *   • |scoreA - scoreB| ≤ 2.
 * The score state is evaluated AFTER applying any score event (so the
 * literal game-winning bucket counts as clutch). For non-scoring events
 * (assist/steal/block) the score state at the time of the event is used.
 */
function isClutch(scoreA: number, scoreB: number, target: number): boolean {
  return (
    Math.max(scoreA, scoreB) >= target - 2 &&
    Math.abs(scoreA - scoreB) <= 2
  );
}

async function _getClutchStats(season?: number): Promise<ClutchEntry[]> {
  await initDb();
  const db = getDb();

  let gameFilter = "";
  let args: string[] = [];
  if (season != null) {
    const { gameIds } = await getSeasonGameIds(season);
    if (gameIds.length === 0) return [];
    gameFilter = `AND g.id IN (${gameIds.map(() => "?").join(",")})`;
    args = gameIds;
  }

  const [gamesRes, eventsRes, rostersRes, playersRes] = await Promise.all([
    db.execute({
      sql: `SELECT id, target_score FROM games g WHERE g.status='finished' ${gameFilter}`,
      args,
    }),
    db.execute({
      sql: `
        SELECT ge.id, ge.game_id, ge.player_id, ge.event_type, ge.point_value,
               ge.corrected_event_id, ge.created_at
        FROM game_events ge
        JOIN games g ON g.id = ge.game_id
        WHERE g.status='finished' ${gameFilter}
        ORDER BY ge.game_id, ge.created_at ASC, ge.id ASC
      `,
      args,
    }),
    db.execute({
      sql: `
        SELECT r.game_id, r.player_id
        FROM rosters r
        JOIN games g ON g.id = r.game_id
        WHERE g.status='finished' ${gameFilter}
      `,
      args,
    }),
    db.execute({ sql: `SELECT id, name FROM players`, args: [] }),
  ]);

  const targetByGame = new Map<string, number>();
  for (const row of gamesRes.rows) {
    const r = row as unknown as GameRow;
    targetByGame.set(r.id, r.target_score ?? 11);
  }

  const eventsByGame = new Map<string, EventRow[]>();
  for (const row of eventsRes.rows) {
    const r = row as unknown as EventRow;
    if (!eventsByGame.has(r.game_id)) eventsByGame.set(r.game_id, []);
    eventsByGame.get(r.game_id)!.push(r);
  }

  const rosterByGame = new Map<string, Set<string>>();
  for (const row of rostersRes.rows) {
    const r = row as unknown as RosterRow;
    if (!rosterByGame.has(r.game_id)) rosterByGame.set(r.game_id, new Set());
    rosterByGame.get(r.game_id)!.add(r.player_id);
  }
  // Player team per game (so corrections can be applied to the right side
  // when only the player_id is known). Build alongside the roster set.
  const teamByPlayerGame = new Map<string, Map<string, "A" | "B">>();
  // We need team info — load it separately.
  const teamRes = await db.execute({
    sql: `
      SELECT r.game_id, r.player_id, r.team
      FROM rosters r JOIN games g ON g.id = r.game_id
      WHERE g.status='finished' ${gameFilter}
    `,
    args,
  });
  for (const row of teamRes.rows) {
    const gid = row.game_id as string;
    const pid = row.player_id as string;
    const team = row.team as "A" | "B";
    if (!teamByPlayerGame.has(gid)) teamByPlayerGame.set(gid, new Map());
    teamByPlayerGame.get(gid)!.set(pid, team);
  }

  const nameById = new Map<string, string>();
  for (const row of playersRes.rows) {
    const p = row as unknown as PlayerNameRow;
    nameById.set(p.id, p.name);
  }

  interface Agg {
    pts: number;
    ast: number;
    stl: number;
    blk: number;
    games: Set<string>;
  }
  const byPlayer = new Map<string, Agg>();
  const ensure = (pid: string): Agg => {
    let a = byPlayer.get(pid);
    if (!a) {
      a = { pts: 0, ast: 0, stl: 0, blk: 0, games: new Set() };
      byPlayer.set(pid, a);
    }
    return a;
  };

  // Walk each game. Apply score events to a running (scoreA, scoreB) and
  // tag each event as clutch based on the score AT the time of (or just
  // after) the event. Apply corrections by reversing the matching score
  // (best-effort: corrected_event_id when present, otherwise the most
  // recent matching score by the same player).
  for (const [gid, events] of eventsByGame) {
    const target = targetByGame.get(gid) ?? 11;
    const teams = teamByPlayerGame.get(gid);
    if (!teams) continue;

    let scoreA = 0;
    let scoreB = 0;
    const undone = new Set<number>();
    const clutchPlayersInGame = new Set<string>();

    // Pre-pass 1: corrections trust corrected_event_id when it points at a
    // real score in this same game.
    const scoreIds = new Set(
      events.filter((e) => e.event_type === "score").map((e) => e.id),
    );
    const pendingCorr: EventRow[] = [];
    for (const c of events) {
      if (c.event_type !== "correction") continue;
      if (
        c.corrected_event_id !== null &&
        scoreIds.has(c.corrected_event_id) &&
        !undone.has(c.corrected_event_id)
      ) {
        undone.add(c.corrected_event_id);
      } else {
        pendingCorr.push(c);
      }
    }
    // Pre-pass 2: remaining corrections fall back to (player, opposite pv,
    // earlier timestamp) heuristic.
    for (const c of pendingCorr) {
      const cands = events
        .filter(
          (s) =>
            s.event_type === "score" &&
            s.player_id === c.player_id &&
            s.point_value === -c.point_value &&
            s.created_at < c.created_at &&
            !undone.has(s.id),
        )
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) || b.id - a.id,
        );
      if (cands.length > 0) undone.add(cands[0].id);
    }

    // Walk chronologically, evaluating clutch state per event.
    for (const e of events) {
      const team = teams.get(e.player_id);
      if (!team) continue;
      if (e.event_type === "score" && !undone.has(e.id)) {
        if (team === "A") scoreA += e.point_value;
        else scoreB += e.point_value;
      }
      // Clutch state evaluated AFTER applying this score event (so a
      // game-winning shot lands in the clutch window).
      const clutch = isClutch(scoreA, scoreB, target);
      if (!clutch) continue;

      if (e.event_type === "score" && !undone.has(e.id)) {
        const a = ensure(e.player_id);
        a.pts += e.point_value;
        clutchPlayersInGame.add(e.player_id);
      } else if (e.event_type === "assist") {
        const a = ensure(e.player_id);
        a.ast += 1;
        clutchPlayersInGame.add(e.player_id);
      } else if (e.event_type === "steal") {
        const a = ensure(e.player_id);
        a.stl += 1;
        clutchPlayersInGame.add(e.player_id);
      } else if (e.event_type === "block") {
        const a = ensure(e.player_id);
        a.blk += 1;
        clutchPlayersInGame.add(e.player_id);
      }
    }

    // If any clutch event occurred, count this game toward clutch_games
    // for everyone on the roster (both teams — they all played in clutch
    // time even if they didn't record a stat).
    if (clutchPlayersInGame.size > 0) {
      const roster = rosterByGame.get(gid);
      if (roster) {
        for (const pid of roster) {
          ensure(pid).games.add(gid);
        }
      }
    }
  }

  const out: ClutchEntry[] = [];
  for (const [pid, a] of byPlayer) {
    if (a.games.size === 0) continue;
    const fp = a.pts + a.ast + a.stl + a.blk;
    out.push({
      player_id: pid,
      name: nameById.get(pid) ?? "Unknown",
      clutch_games: a.games.size,
      clutch_pts: a.pts,
      clutch_ast: a.ast,
      clutch_stl: a.stl,
      clutch_blk: a.blk,
      clutch_fp: fp,
      clutch_fp_pg: Math.round((fp / a.games.size) * 100) / 100,
    });
  }

  return out.sort((a, b) => b.clutch_fp_pg - a.clutch_fp_pg);
}

export const getClutchStats = unstable_cache(
  _getClutchStats,
  ["getClutchStats"],
  { tags: [TAG_STATS], revalidate: 86400 },
);
