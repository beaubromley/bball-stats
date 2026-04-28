import { v4 as uuid } from "uuid";
import { initDb, getDb } from "./turso";
import { getLeaderboard, getSeasonGameIds, type PlayerStats } from "./stats";
import { GAMES_PER_SEASON } from "./seasons";
import { getSeasonAwards, setSeasonMvp } from "./awards";

// Minimum games played in the season to be eligible to vote in MVP voting.
export const VOTER_MIN_GAMES = 5;

export interface BallotSummary {
  player_id: string;
  name: string;
  has_voted: boolean;
}

export interface VoteCandidate {
  player_id: string;
  name: string;
}

export interface VoteTallyRow {
  player_id: string;
  name: string;
  total_points: number;        // 3*first + 2*second + 1*third
  first_votes: number;
  second_votes: number;
  third_votes: number;
  fppg: number;                // tiebreaker
  ppg: number;                 // tiebreaker
}

export interface BallotRow {
  voter_player_id: string;
  voter_name: string;
  pick_1: { player_id: string; name: string };
  pick_2: { player_id: string; name: string };
  pick_3: { player_id: string; name: string };
  created_at: string;
}

export interface OpenVotingState {
  state: "open";
  candidates: VoteCandidate[];
  voters: BallotSummary[];
  voted_count: number;
  total_eligible: number;
}

export interface ClosedVotingState {
  state: "closed";
  closed_at: string;
  candidates: VoteCandidate[];
  voters: BallotSummary[];
  results: VoteTallyRow[];
  winner_player_id: string | null;
  ballots: BallotRow[];
}

export interface NotYetOpenState {
  state: "not_yet_open";
  games_in_season: number;
  total_games_in_season: number;
}

export type VotingState = OpenVotingState | ClosedVotingState | NotYetOpenState;

// ---------------- internal helpers ----------------

interface InternalContext {
  season: number;
  gameIds: string[];
  gamesInSeason: number;
  totalGamesInSeason: number;
  candidates: VoteCandidate[];
  voters: BallotSummary[];
  hasVoted: Map<string, boolean>;
  stats: PlayerStats[];
  closedAt: string | null;
  lifecycleRowExists: boolean;
}

async function loadContext(season: number): Promise<InternalContext> {
  await initDb();
  const db = getDb();

  const { gameIds, meta } = await getSeasonGameIds(season);
  const stats = gameIds.length > 0 ? await getLeaderboard(gameIds) : [];

  // Candidates = first-team All-YMCA. We share awards.ts so the rules
  // stay in lockstep with what's displayed on the awards page.
  const awards = await getSeasonAwards(season);
  const candidates: VoteCandidate[] = awards.all_ymca_1st.map((w) => ({
    player_id: w.player_id,
    name: w.name,
  }));

  // Eligible voters = anyone with ≥ VOTER_MIN_GAMES GP this season.
  const eligibleVoters = stats
    .filter((p) => p.games_played >= VOTER_MIN_GAMES)
    .map((p) => ({ player_id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Pull the voted-by set from mvp_votes.
  const votedRes = await db.execute({
    sql: "SELECT voter_player_id FROM mvp_votes WHERE season = ?",
    args: [season],
  });
  const hasVoted = new Map<string, boolean>();
  for (const row of votedRes.rows) {
    hasVoted.set(row.voter_player_id as string, true);
  }
  const voters: BallotSummary[] = eligibleVoters.map((v) => ({
    ...v,
    has_voted: hasVoted.get(v.player_id) === true,
  }));

  // Voting lifecycle row. Row absent + season < 82 → not_yet_open. Row
  // present with closed_at NULL → open (either auto-opened or admin
  // force-opened). Row present with closed_at set → closed.
  const lifecycleRes = await db.execute({
    sql: "SELECT closed_at FROM mvp_voting WHERE season = ?",
    args: [season],
  });
  const lifecycleRowExists = lifecycleRes.rows.length > 0;
  const closedAt =
    lifecycleRes.rows[0]?.closed_at != null
      ? String(lifecycleRes.rows[0].closed_at)
      : null;

  return {
    season,
    gameIds,
    gamesInSeason: meta.gamesInSeason,
    totalGamesInSeason: GAMES_PER_SEASON,
    candidates,
    voters,
    hasVoted,
    stats,
    closedAt,
    lifecycleRowExists,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function tallyFromContext(ctx: InternalContext): VoteTallyRow[] {
  // Pull per-candidate tallies and tiebreaker stats. We compute fully in JS
  // since the candidate set is at most 5 — no need for a fancy SQL aggregate.
  const candidateMap = new Map<string, VoteTallyRow>();
  for (const c of ctx.candidates) {
    const stat = ctx.stats.find((s) => s.id === c.player_id);
    candidateMap.set(c.player_id, {
      player_id: c.player_id,
      name: c.name,
      total_points: 0,
      first_votes: 0,
      second_votes: 0,
      third_votes: 0,
      fppg: stat ? r2((stat.total_points + stat.assists + stat.steals + stat.blocks) / (stat.effective_games || 1)) : 0,
      ppg: stat ? stat.ppg : 0,
    });
  }
  return Array.from(candidateMap.values());
}

async function fillTally(ctx: InternalContext): Promise<VoteTallyRow[]> {
  const db = getDb();
  const rows = tallyFromContext(ctx);
  if (rows.length === 0) return rows;

  const ballotRes = await db.execute({
    sql: `SELECT pick_1_player_id, pick_2_player_id, pick_3_player_id
          FROM mvp_votes WHERE season = ?`,
    args: [ctx.season],
  });
  const map = new Map(rows.map((r) => [r.player_id, r]));
  for (const row of ballotRes.rows) {
    const p1 = row.pick_1_player_id as string;
    const p2 = row.pick_2_player_id as string;
    const p3 = row.pick_3_player_id as string;
    const r1 = map.get(p1);
    if (r1) {
      r1.first_votes += 1;
      r1.total_points += 3;
    }
    const r2_ = map.get(p2);
    if (r2_) {
      r2_.second_votes += 1;
      r2_.total_points += 2;
    }
    const r3 = map.get(p3);
    if (r3) {
      r3.third_votes += 1;
      r3.total_points += 1;
    }
  }
  rows.sort(compareTally);
  return rows;
}

function compareTally(a: VoteTallyRow, b: VoteTallyRow): number {
  if (b.total_points !== a.total_points) return b.total_points - a.total_points;
  if (b.first_votes !== a.first_votes) return b.first_votes - a.first_votes;
  if (b.second_votes !== a.second_votes) return b.second_votes - a.second_votes;
  if (b.third_votes !== a.third_votes) return b.third_votes - a.third_votes;
  if (b.fppg !== a.fppg) return b.fppg - a.fppg;
  if (b.ppg !== a.ppg) return b.ppg - a.ppg;
  return 0;
}

function isFullyTied(a: VoteTallyRow, b: VoteTallyRow): boolean {
  return (
    a.total_points === b.total_points &&
    a.first_votes === b.first_votes &&
    a.second_votes === b.second_votes &&
    a.third_votes === b.third_votes &&
    a.fppg === b.fppg &&
    a.ppg === b.ppg
  );
}

async function loadBallots(ctx: InternalContext): Promise<BallotRow[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `
      SELECT
        v.voter_player_id, vp.name AS voter_name,
        v.pick_1_player_id, p1.name AS pick_1_name,
        v.pick_2_player_id, p2.name AS pick_2_name,
        v.pick_3_player_id, p3.name AS pick_3_name,
        v.created_at
      FROM mvp_votes v
      JOIN players vp ON vp.id = v.voter_player_id
      JOIN players p1 ON p1.id = v.pick_1_player_id
      JOIN players p2 ON p2.id = v.pick_2_player_id
      JOIN players p3 ON p3.id = v.pick_3_player_id
      WHERE v.season = ?
      ORDER BY v.created_at ASC
    `,
    args: [ctx.season],
  });
  return res.rows.map((r) => ({
    voter_player_id: r.voter_player_id as string,
    voter_name: r.voter_name as string,
    pick_1: { player_id: r.pick_1_player_id as string, name: r.pick_1_name as string },
    pick_2: { player_id: r.pick_2_player_id as string, name: r.pick_2_name as string },
    pick_3: { player_id: r.pick_3_player_id as string, name: r.pick_3_name as string },
    created_at: String(r.created_at),
  }));
}

// ---------------- public API ----------------

export async function getVotingState(season: number): Promise<VotingState> {
  const ctx = await loadContext(season);

  // Voting opens automatically when the season is mathematically complete,
  // or manually when an admin has inserted a lifecycle row (force-opened).
  // Either way we still need ≥ 3 candidates to rank.
  const seasonComplete = ctx.gamesInSeason >= ctx.totalGamesInSeason;
  const adminForceOpened = ctx.lifecycleRowExists && !ctx.closedAt;
  const isOpen = seasonComplete || adminForceOpened;
  const enoughCandidates = ctx.candidates.length >= 3;

  if (ctx.closedAt) {
    const results = await fillTally(ctx);
    const ballots = await loadBallots(ctx);
    let winner_player_id: string | null = null;
    if (results.length > 0 && results[0].total_points > 0) {
      const tied =
        results.length >= 2 && isFullyTied(results[0], results[1]);
      if (!tied) winner_player_id = results[0].player_id;
    }
    return {
      state: "closed",
      closed_at: ctx.closedAt,
      candidates: ctx.candidates,
      voters: ctx.voters,
      results,
      winner_player_id,
      ballots,
    };
  }

  if (!isOpen || !enoughCandidates) {
    return {
      state: "not_yet_open",
      games_in_season: ctx.gamesInSeason,
      total_games_in_season: ctx.totalGamesInSeason,
    };
  }

  return {
    state: "open",
    candidates: ctx.candidates,
    voters: ctx.voters,
    voted_count: ctx.voters.filter((v) => v.has_voted).length,
    total_eligible: ctx.voters.length,
  };
}

export interface CastVoteArgs {
  season: number;
  voter_player_id: string;
  pick_1: string;
  pick_2: string;
  pick_3: string;
  ip_address: string | null;
  user_agent: string | null;
}

export type CastVoteResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export async function castVote(args: CastVoteArgs): Promise<CastVoteResult> {
  const ctx = await loadContext(args.season);

  if (ctx.closedAt) {
    return { ok: false, error: "voting is closed", status: 409 };
  }
  const seasonComplete = ctx.gamesInSeason >= ctx.totalGamesInSeason;
  const adminForceOpened = ctx.lifecycleRowExists && !ctx.closedAt;
  if (!seasonComplete && !adminForceOpened) {
    return { ok: false, error: "voting has not opened yet", status: 409 };
  }
  if (ctx.candidates.length < 3) {
    return { ok: false, error: "not enough candidates", status: 409 };
  }

  const voter = ctx.voters.find((v) => v.player_id === args.voter_player_id);
  if (!voter) {
    return { ok: false, error: "voter is not eligible", status: 403 };
  }
  if (voter.has_voted) {
    return { ok: false, error: "voter has already voted", status: 409 };
  }

  const picks = [args.pick_1, args.pick_2, args.pick_3];
  const candidateIds = new Set(ctx.candidates.map((c) => c.player_id));
  if (picks.some((p) => !candidateIds.has(p))) {
    return { ok: false, error: "pick is not a candidate", status: 400 };
  }
  const picksSet = new Set(picks);
  if (picksSet.size !== 3) {
    return { ok: false, error: "duplicate pick", status: 400 };
  }

  const db = getDb();
  try {
    await db.execute({
      sql: `
        INSERT INTO mvp_votes
          (id, season, voter_player_id, pick_1_player_id, pick_2_player_id, pick_3_player_id, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        uuid(),
        args.season,
        args.voter_player_id,
        args.pick_1,
        args.pick_2,
        args.pick_3,
        args.ip_address,
        args.user_agent,
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("unique")) {
      return { ok: false, error: "voter has already voted", status: 409 };
    }
    return { ok: false, error: msg, status: 500 };
  }
  return { ok: true };
}

export async function closeVoting(
  season: number,
): Promise<{ winner_player_id: string | null; tied: boolean }> {
  await initDb();
  const db = getDb();

  await db.execute({
    sql: `
      INSERT INTO mvp_voting (season, closed_at)
      VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(season) DO UPDATE SET closed_at = CURRENT_TIMESTAMP
    `,
    args: [season],
  });

  // Re-load context AFTER the insert so the rest of the system sees the closed state.
  const ctx = await loadContext(season);
  const results = await fillTally(ctx);
  let winner_player_id: string | null = null;
  let tied = false;
  if (results.length > 0 && results[0].total_points > 0) {
    tied = results.length >= 2 && isFullyTied(results[0], results[1]);
    if (!tied) winner_player_id = results[0].player_id;
  }
  if (winner_player_id) {
    await setSeasonMvp(season, winner_player_id);
  }
  return { winner_player_id, tied };
}

/**
 * Admin-only escape hatch: force voting open even if the season hasn't
 * hit the auto-open threshold yet. Used for testing and for one-off
 * "let's vote early" cases. Inserts a lifecycle row with closed_at NULL.
 */
export async function forceOpenVoting(season: number): Promise<void> {
  await initDb();
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO mvp_voting (season, closed_at)
      VALUES (?, NULL)
      ON CONFLICT(season) DO UPDATE SET closed_at = NULL
    `,
    args: [season],
  });
}

export async function reopenVoting(season: number): Promise<void> {
  await initDb();
  const db = getDb();
  await db.execute({
    sql: "UPDATE mvp_voting SET closed_at = NULL WHERE season = ?",
    args: [season],
  });
}

/**
 * Admin escape hatch: wipe all ballots, the lifecycle row, and any
 * auto-set MVP for the season. Returns the panel to "not_yet_open"
 * (or auto-open if the season is already complete). Intended for
 * cleaning up after a force-open test or backing out a fraudulent vote.
 */
export async function resetVoting(season: number): Promise<void> {
  await initDb();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM mvp_votes WHERE season = ?",
    args: [season],
  });
  await db.execute({
    sql: "DELETE FROM mvp_voting WHERE season = ?",
    args: [season],
  });
  await setSeasonMvp(season, null);
}

export async function tallyVotes(season: number): Promise<VoteTallyRow[]> {
  const ctx = await loadContext(season);
  return fillTally(ctx);
}
