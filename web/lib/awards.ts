import { initDb, getDb } from "./turso";
import { getLeaderboard, getSeasonGameIds, type PlayerStats } from "./stats";
import { GAMES_PER_SEASON } from "./seasons";

// Minimum games played in the season to be eligible for any computed award.
export const AWARDS_MIN_GAMES = 30;
// Lower bar used only to fill remaining All-YMCA 2nd team slots when the
// full-eligibility pool doesn't produce 10 qualified players.
export const AWARDS_MIN_GAMES_FALLBACK = 10;

export interface AwardWinner {
  player_id: string;
  name: string;
  value: number;        // primary stat value (e.g. PPG)
  value_label: string;  // display string (e.g. "14.2 PPG")
  games_played: number;
}

export interface AwardEntry {
  winner: AwardWinner | null;
  runner_up: AwardWinner | null;
}

export interface SeasonAwards {
  season: number;
  games_in_season: number;
  total_games_in_season: number;
  min_games_required: number;
  mvp: AwardWinner | null;              // manually set by admin (no runner-up)
  scoring_leader: AwardEntry;
  defensive_pots: AwardEntry;
  clutch_pots: AwardEntry;
  game_mvp_leader: AwardEntry;          // most individual game MVPs
  all_ymca_1st: AwardWinner[];          // top 5 by fantasy PPG
  all_ymca_2nd: AwardWinner[];          // ranks 6-10 by fantasy PPG
  all_defensive: AwardWinner[];         // top 5 by total steals + blocks
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt2 = (n: number) => r2(n).toFixed(2);

function toScoringWinner(p: PlayerStats): AwardWinner {
  const ppg = r2(p.total_points / (p.effective_games || 1));
  return {
    player_id: p.id,
    name: p.name,
    value: ppg,
    value_label: `${fmt2(ppg)} PPG`,
    games_played: p.games_played,
  };
}

function toDefensiveWinner(p: PlayerStats): AwardWinner {
  const combined = r2((p.steals + p.blocks) / (p.effective_games || 1));
  return {
    player_id: p.id,
    name: p.name,
    value: combined,
    value_label: `${fmt2(combined)} STL+BLK per game`,
    games_played: p.games_played,
  };
}

function toDefensiveTotalWinner(p: PlayerStats): AwardWinner {
  const total = p.steals + p.blocks;
  return {
    player_id: p.id,
    name: p.name,
    value: total,
    value_label: `${total} STL+BLK`,
    games_played: p.games_played,
  };
}

function toGameMvpWinner(p: PlayerStats): AwardWinner {
  return {
    player_id: p.id,
    name: p.name,
    value: p.mvp_count,
    value_label: `${p.mvp_count} game MVP${p.mvp_count !== 1 ? "s" : ""}`,
    games_played: p.games_played,
  };
}

function toAllYmcaWinner(p: PlayerStats): AwardWinner {
  const fpg = r2(
    (p.total_points + p.assists + p.steals + p.blocks) / (p.effective_games || 1),
  );
  return {
    player_id: p.id,
    name: p.name,
    value: fpg,
    value_label: `${fmt2(fpg)} FPPG`,
    games_played: p.games_played,
  };
}

export async function getSeasonAwards(season: number): Promise<SeasonAwards> {
  await initDb();
  const db = getDb();

  const { gameIds, meta } = await getSeasonGameIds(season);

  const emptyEntry: AwardEntry = { winner: null, runner_up: null };
  const empty: SeasonAwards = {
    season,
    games_in_season: meta.gamesInSeason,
    total_games_in_season: GAMES_PER_SEASON,
    min_games_required: AWARDS_MIN_GAMES,
    mvp: null,
    scoring_leader: emptyEntry,
    defensive_pots: emptyEntry,
    clutch_pots: emptyEntry,
    game_mvp_leader: emptyEntry,
    all_ymca_1st: [],
    all_ymca_2nd: [],
    all_defensive: [],
  };

  // MVP is admin-settable even if no games yet
  const mvpResult = await db.execute({
    sql: `
      SELECT sa.player_id, p.name
      FROM season_awards sa
      JOIN players p ON p.id = sa.player_id
      WHERE sa.season = ? AND sa.award_type = 'mvp'
    `,
    args: [season],
  });
  const mvpRow = mvpResult.rows[0];

  if (gameIds.length === 0) {
    return {
      ...empty,
      mvp: mvpRow ? {
        player_id: mvpRow.player_id as string,
        name: mvpRow.name as string,
        value: 0,
        value_label: "Voted",
        games_played: 0,
      } : null,
    };
  }

  // Leaderboard scoped to the season's games — PPG/FPPG are already
  // normalized to game-to-11 via effective_games in getLeaderboard.
  const stats = await getLeaderboard(gameIds);
  const eligible = stats.filter((p) => p.games_played >= AWARDS_MIN_GAMES);
  const eligibleIds = new Set(eligible.map((p) => p.id));

  // Scoring leader — PPG (2dp), tiebreak total_points
  const ppg2 = (p: PlayerStats) => r2(p.total_points / (p.effective_games || 1));
  const scoringSort = [...eligible].sort(
    (a, b) => (ppg2(b) - ppg2(a)) || (b.total_points - a.total_points),
  );
  const scoring_leader: AwardEntry = {
    winner: scoringSort[0] ? toScoringWinner(scoringSort[0]) : null,
    runner_up: scoringSort[1] ? toScoringWinner(scoringSort[1]) : null,
  };

  // Defensive POTS — (STL+BLK)/game (2dp), tiebreak total steals+blocks
  const stlBlkPg2 = (p: PlayerStats) =>
    r2((p.steals + p.blocks) / (p.effective_games || 1));
  const defSort = [...eligible].sort((a, b) => {
    const aVal = stlBlkPg2(a);
    const bVal = stlBlkPg2(b);
    if (bVal !== aVal) return bVal - aVal;
    return (b.steals + b.blocks) - (a.steals + a.blocks);
  });
  const defensive_pots: AwardEntry = {
    winner: defSort[0] ? toDefensiveWinner(defSort[0]) : null,
    runner_up: defSort[1] ? toDefensiveWinner(defSort[1]) : null,
  };

  // Most game MVPs — count of individual game MVP awards, tiebreak fantasy_points
  const mvpCountSort = [...eligible].sort(
    (a, b) => (b.mvp_count - a.mvp_count) || (b.fantasy_points - a.fantasy_points),
  );
  const game_mvp_leader: AwardEntry = {
    winner: mvpCountSort[0] && mvpCountSort[0].mvp_count > 0 ? toGameMvpWinner(mvpCountSort[0]) : null,
    runner_up: mvpCountSort[1] && mvpCountSort[1].mvp_count > 0 ? toGameMvpWinner(mvpCountSort[1]) : null,
  };

  // All-YMCA 1st/2nd — by fantasy PPG (2dp), tiebreak fantasy_points.
  // 1st team: strictly top 5 among players with ≥ AWARDS_MIN_GAMES.
  // 2nd team: ranks 6–10 among the same eligible pool, then fill remaining
  // slots from players with ≥ AWARDS_MIN_GAMES_FALLBACK GP (ranked below
  // anyone who hit the full game requirement).
  const fpg2 = (p: PlayerStats) =>
    r2((p.total_points + p.assists + p.steals + p.blocks) / (p.effective_games || 1));
  const bySeasonFp = (a: PlayerStats, b: PlayerStats) =>
    (fpg2(b) - fpg2(a)) || (b.fantasy_points - a.fantasy_points);

  const fpSort = [...eligible].sort(bySeasonFp);
  const fallbackPool = stats
    .filter(
      (p) =>
        p.games_played >= AWARDS_MIN_GAMES_FALLBACK &&
        p.games_played < AWARDS_MIN_GAMES,
    )
    .sort(bySeasonFp);

  const all_ymca_1st = fpSort.slice(0, 5).map(toAllYmcaWinner);
  const second_primary = fpSort.slice(5, 10);
  const needed = Math.max(0, 5 - second_primary.length);
  const all_ymca_2nd = [
    ...second_primary,
    ...fallbackPool.slice(0, needed),
  ].map(toAllYmcaWinner);

  // All-Defensive Team — top 5 by TOTAL steals + blocks, tiebreak per-game rate
  const defTotalSort = [...eligible].sort((a, b) => {
    const aVal = a.steals + a.blocks;
    const bVal = b.steals + b.blocks;
    if (bVal !== aVal) return bVal - aVal;
    return (b.spg + b.bpg) - (a.spg + a.bpg);
  });
  const all_defensive = defTotalSort.slice(0, 5).map(toDefensiveTotalWinner);

  // Clutch POTS — last scoring event in games decided by ≤ 3 points,
  // credited only to the scorer on the winning team.
  const placeholders = gameIds.map(() => "?").join(",");
  const clutchResult = await db.execute({
    sql: `
      WITH team_scores AS (
        SELECT r.game_id, r.team,
               COALESCE(SUM(CASE WHEN ge.event_type IN ('score','correction') THEN ge.point_value ELSE 0 END), 0) as score
        FROM rosters r
        LEFT JOIN game_events ge ON ge.game_id = r.game_id AND ge.player_id = r.player_id
        WHERE r.game_id IN (${placeholders})
        GROUP BY r.game_id, r.team
      ),
      game_margins AS (
        SELECT ts_a.game_id,
               ABS(COALESCE(ts_a.score, 0) - COALESCE(ts_b.score, 0)) as margin
        FROM team_scores ts_a
        LEFT JOIN team_scores ts_b ON ts_b.game_id = ts_a.game_id AND ts_b.team = 'B'
        WHERE ts_a.team = 'A'
      ),
      last_scores AS (
        SELECT
          ge.game_id, ge.player_id,
          ROW_NUMBER() OVER (
            PARTITION BY ge.game_id
            ORDER BY ge.created_at DESC, ge.id DESC
          ) as rn
        FROM game_events ge
        WHERE ge.event_type = 'score' AND ge.point_value > 0 AND ge.game_id IN (${placeholders})
      )
      SELECT
        ls.player_id,
        p.name,
        COUNT(*) as game_winners
      FROM last_scores ls
      JOIN players p ON p.id = ls.player_id
      JOIN games g ON g.id = ls.game_id
      JOIN rosters r ON r.game_id = ls.game_id AND r.player_id = ls.player_id
      JOIN game_margins gm ON gm.game_id = ls.game_id
      WHERE ls.rn = 1
        AND g.status = 'finished'
        AND g.winning_team = r.team
        AND gm.margin <= 3
      GROUP BY ls.player_id, p.name
      ORDER BY game_winners DESC
    `,
    args: [...gameIds, ...gameIds],
  });

  // Pick the top two eligible players for winner + runner-up
  const clutchPicks: AwardWinner[] = [];
  for (const row of clutchResult.rows) {
    const pid = row.player_id as string;
    if (!eligibleIds.has(pid)) continue;
    const eligiblePlayer = eligible.find((p) => p.id === pid);
    if (!eligiblePlayer) continue;
    const count = Number(row.game_winners);
    clutchPicks.push({
      player_id: pid,
      name: row.name as string,
      value: count,
      value_label: `${count} game-winner${count !== 1 ? "s" : ""}`,
      games_played: eligiblePlayer.games_played,
    });
    if (clutchPicks.length >= 2) break;
  }
  const clutch_pots: AwardEntry = {
    winner: clutchPicks[0] ?? null,
    runner_up: clutchPicks[1] ?? null,
  };

  // MVP lookup (already queried above) — look up games_played if possible
  const mvp: AwardWinner | null = mvpRow
    ? {
        player_id: mvpRow.player_id as string,
        name: mvpRow.name as string,
        value: 0,
        value_label: "Voted",
        games_played: stats.find((p) => p.id === mvpRow.player_id)?.games_played ?? 0,
      }
    : null;

  return {
    season,
    games_in_season: meta.gamesInSeason,
    total_games_in_season: GAMES_PER_SEASON,
    min_games_required: AWARDS_MIN_GAMES,
    mvp,
    scoring_leader,
    defensive_pots,
    clutch_pots,
    game_mvp_leader,
    all_ymca_1st,
    all_ymca_2nd,
    all_defensive,
  };
}

export async function setSeasonMvp(season: number, playerId: string | null): Promise<void> {
  await initDb();
  const db = getDb();
  if (!playerId) {
    await db.execute({
      sql: "DELETE FROM season_awards WHERE season = ? AND award_type = 'mvp'",
      args: [season],
    });
    return;
  }
  await db.execute({
    sql: `
      INSERT INTO season_awards (season, award_type, player_id)
      VALUES (?, 'mvp', ?)
      ON CONFLICT(season, award_type) DO UPDATE SET
        player_id = excluded.player_id,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [season, playerId],
  });
}
