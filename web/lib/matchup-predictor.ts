import { unstable_cache } from "next/cache";
import { getDb, initDb } from "./turso";
import { TAG_STATS } from "./cache-tags";

export interface MatchupModel {
  /** Logistic intercept (a in 1/(1+exp(-(a+b*delta)))). */
  intercept: number;
  /** Logistic slope (b). */
  slope: number;
  /** Number of historical games used in the fit. */
  training_count: number;
  /** Number of finished games on file (including ones excluded for being all-debutants). */
  total_finished: number;
  /** 0.25-wide bin distribution for visualization. delta is the bin center. */
  bins: { delta: number; wins: number; total: number }[];
}

interface PgsRow {
  player_id: string;
  game_id: string;
  fantasy_points: number;
  team: string;
  start_time: string;
  won: number;
}

/** Fit a 1-D logistic regression with batch gradient descent. */
function fitLogistic(
  samples: { x: number; y: number }[],
): { intercept: number; slope: number } {
  if (samples.length === 0) return { intercept: 0, slope: 0 };
  let a = 0;
  let b = 0;
  const lr = 0.05;
  const iters = 2000;
  const n = samples.length;
  for (let iter = 0; iter < iters; iter++) {
    let da = 0;
    let db = 0;
    for (const { x, y } of samples) {
      const z = a + b * x;
      const p = 1 / (1 + Math.exp(-z));
      const e = p - y;
      da += e;
      db += e * x;
    }
    a -= (lr * da) / n;
    b -= (lr * db) / n;
  }
  return { intercept: a, slope: b };
}

async function _getMatchupModel(): Promise<MatchupModel> {
  await initDb();
  const db = getDb();

  // All finished games' per-player stat rows in chronological order. Each
  // game produces N rows (one per player on a roster).
  const result = await db.execute({
    sql: `
      SELECT player_id, game_id, fantasy_points, team, start_time, won
      FROM player_game_stats
      WHERE game_status = 'finished'
      ORDER BY start_time ASC, game_id ASC
    `,
    args: [],
  });
  const rows = result.rows as unknown as PgsRow[];

  // Group by game_id so we can compute team avgs per game.
  const gameOrder: string[] = [];
  const byGame = new Map<string, PgsRow[]>();
  for (const r of rows) {
    if (!byGame.has(r.game_id)) {
      gameOrder.push(r.game_id);
      byGame.set(r.game_id, []);
    }
    byGame.get(r.game_id)!.push(r);
  }

  // Walk games in chronological order. For each game, snapshot every
  // rostered player's prior-FPG before adding the current game to the
  // running totals (so we never leak future data into the training input).
  const running = new Map<string, { games: number; fp: number }>();
  const samples: { x: number; y: number }[] = [];
  let totalFinished = 0;

  for (const gid of gameOrder) {
    const playerRows = byGame.get(gid)!;
    totalFinished++;

    const aFpgs: number[] = [];
    const bFpgs: number[] = [];
    let winningTeam: string | null = null;

    for (const r of playerRows) {
      const prior = running.get(r.player_id);
      // Skip debutants — they have no prior FPG to contribute.
      if (prior && prior.games > 0) {
        const fpg = prior.fp / prior.games;
        if (r.team === "A") aFpgs.push(fpg);
        else if (r.team === "B") bFpgs.push(fpg);
      }
      // Infer winning team from the `won` flag on this game's rows.
      if (Number(r.won) === 1) winningTeam = r.team;
    }

    // Need at least one non-debutant on each side and a known winner.
    if (aFpgs.length > 0 && bFpgs.length > 0 && winningTeam) {
      const aAvg = aFpgs.reduce((s, x) => s + x, 0) / aFpgs.length;
      const bAvg = bFpgs.reduce((s, x) => s + x, 0) / bFpgs.length;
      const delta = aAvg - bAvg;
      const y = winningTeam === "A" ? 1 : 0;
      samples.push({ x: delta, y });
    }

    // Now bump the running totals with this game's results so subsequent
    // games see this player's updated FPG.
    for (const r of playerRows) {
      const entry = running.get(r.player_id) ?? { games: 0, fp: 0 };
      entry.games += 1;
      entry.fp += Number(r.fantasy_points) || 0;
      running.set(r.player_id, entry);
    }
  }

  const { intercept, slope } = fitLogistic(samples);

  // 0.25-wide bins for the debug view in the response.
  const binMap = new Map<number, { wins: number; total: number }>();
  for (const { x, y } of samples) {
    const bin = Math.round(x / 0.25) * 0.25;
    const key = Math.round(bin * 100) / 100;
    const entry = binMap.get(key) ?? { wins: 0, total: 0 };
    entry.total++;
    if (y === 1) entry.wins++;
    binMap.set(key, entry);
  }
  const bins = Array.from(binMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([delta, v]) => ({ delta, wins: v.wins, total: v.total }));

  return {
    intercept,
    slope,
    training_count: samples.length,
    total_finished: totalFinished,
    bins,
  };
}

export const getMatchupModel = unstable_cache(
  _getMatchupModel,
  ["getMatchupModel"],
  { tags: [TAG_STATS], revalidate: 86400 },
);

export interface StrengthOfScheduleEntry {
  player_id: string;
  name: string;
  /** Games the player had a pre-game expected win% for (had at least one
   *  non-debutant teammate + at least one non-debutant opponent). */
  games_rated: number;
  /** 0-100. 50 = neutral; higher = tougher schedule. Computed as
   *  round(100 * avg(1 - pre-game P(player's team wins))), where the
   *  player is excluded from their own team's FPG average. */
  sos_index: number;
}

interface SoSRow {
  player_id: string;
  name: string;
  game_id: string;
  fantasy_points: number;
  team: string;
  start_time: string;
  won: number;
}

async function _getStrengthOfSchedule(): Promise<StrengthOfScheduleEntry[]> {
  await initDb();
  const model = await getMatchupModel();
  const db = getDb();

  const result = await db.execute({
    sql: `
      SELECT pgs.player_id, p.name, pgs.game_id, pgs.fantasy_points,
             pgs.team, pgs.start_time, pgs.won
      FROM player_game_stats pgs
      JOIN players p ON p.id = pgs.player_id
      WHERE pgs.game_status = 'finished'
      ORDER BY pgs.start_time ASC, pgs.game_id ASC
    `,
    args: [],
  });
  const rows = result.rows as unknown as SoSRow[];

  const gameOrder: string[] = [];
  const byGame = new Map<string, SoSRow[]>();
  for (const r of rows) {
    if (!byGame.has(r.game_id)) {
      gameOrder.push(r.game_id);
      byGame.set(r.game_id, []);
    }
    byGame.get(r.game_id)!.push(r);
  }

  const running = new Map<string, { games: number; fp: number }>();
  const accum = new Map<string, { name: string; sumSos: number; count: number }>();

  const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

  for (const gid of gameOrder) {
    const playerRows = byGame.get(gid)!;

    // Pre-game FPG snapshot for each player on the roster (null = debutant).
    const snap = playerRows.map((r) => {
      const prior = running.get(r.player_id);
      const fpg = prior && prior.games > 0 ? prior.fp / prior.games : null;
      return { row: r, fpg };
    });

    // For each player, compute their team's pre-game avg FPG excluding
    // themselves, the opposing team's avg, the delta, and the expected
    // win prob from the trained model. Contribution = 1 - expected.
    for (let i = 0; i < snap.length; i++) {
      const me = snap[i];
      const myTeam = me.row.team;
      const oppTeam = myTeam === "A" ? "B" : "A";

      const teammates = snap
        .filter((s, j) => j !== i && s.row.team === myTeam && s.fpg !== null)
        .map((s) => s.fpg as number);
      const opponents = snap
        .filter((s) => s.row.team === oppTeam && s.fpg !== null)
        .map((s) => s.fpg as number);

      if (teammates.length === 0 || opponents.length === 0) continue;

      const teamAvg = teammates.reduce((s, x) => s + x, 0) / teammates.length;
      const oppAvg = opponents.reduce((s, x) => s + x, 0) / opponents.length;
      const delta = teamAvg - oppAvg;
      const expectedWin = sigmoid(model.intercept + model.slope * delta);
      const contribution = 1 - expectedWin;

      const entry =
        accum.get(me.row.player_id) ??
        { name: me.row.name, sumSos: 0, count: 0 };
      entry.sumSos += contribution;
      entry.count += 1;
      accum.set(me.row.player_id, entry);
    }

    // Update running totals AFTER the game is rated.
    for (const r of playerRows) {
      const entry = running.get(r.player_id) ?? { games: 0, fp: 0 };
      entry.games += 1;
      entry.fp += Number(r.fantasy_points) || 0;
      running.set(r.player_id, entry);
    }
  }

  return Array.from(accum.entries())
    .map(([player_id, v]) => ({
      player_id,
      name: v.name,
      games_rated: v.count,
      sos_index: Math.round((v.sumSos / v.count) * 100),
    }))
    .sort((a, b) => b.sos_index - a.sos_index);
}

export const getStrengthOfSchedule = unstable_cache(
  _getStrengthOfSchedule,
  ["getStrengthOfSchedule"],
  { tags: [TAG_STATS], revalidate: 86400 },
);
