import { initDb, getDb } from "./turso";
import { getLeaderboard, getSeasonGameIds, type PlayerStats } from "./stats";
import { GAMES_PER_SEASON } from "./seasons";

// Minimum games played in the season to be eligible for any computed award.
export const AWARDS_MIN_GAMES = 30;

export interface AwardWinner {
  player_id: string;
  name: string;
  value: number;        // primary stat value (e.g. PPG)
  value_label: string;  // display string (e.g. "14.2 PPG")
  games_played: number;
}

export interface SeasonAwards {
  season: number;
  games_in_season: number;
  total_games_in_season: number;
  min_games_required: number;
  mvp: AwardWinner | null;              // manually set by admin
  scoring_leader: AwardWinner | null;
  defensive_pots: AwardWinner | null;
  clutch_pots: AwardWinner | null;
  all_ymca_1st: AwardWinner[];          // top 5 by fantasy PPG
  all_ymca_2nd: AwardWinner[];          // ranks 6-10 by fantasy PPG
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function toScoringWinner(p: PlayerStats): AwardWinner {
  return {
    player_id: p.id,
    name: p.name,
    value: p.ppg,
    value_label: `${p.ppg} PPG`,
    games_played: p.games_played,
  };
}

function toDefensiveWinner(p: PlayerStats): AwardWinner {
  const combined = r1(p.spg + p.bpg);
  return {
    player_id: p.id,
    name: p.name,
    value: combined,
    value_label: `${combined} STL+BLK per game`,
    games_played: p.games_played,
  };
}

function toAllYmcaWinner(p: PlayerStats): AwardWinner {
  return {
    player_id: p.id,
    name: p.name,
    value: p.fpg,
    value_label: `${p.fpg} FPPG`,
    games_played: p.games_played,
  };
}

export async function getSeasonAwards(season: number): Promise<SeasonAwards> {
  await initDb();
  const db = getDb();

  const { gameIds, meta } = await getSeasonGameIds(season);

  const empty: SeasonAwards = {
    season,
    games_in_season: meta.gamesInSeason,
    total_games_in_season: GAMES_PER_SEASON,
    min_games_required: AWARDS_MIN_GAMES,
    mvp: null,
    scoring_leader: null,
    defensive_pots: null,
    clutch_pots: null,
    all_ymca_1st: [],
    all_ymca_2nd: [],
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

  // Scoring leader — PPG, tiebreak total_points
  const scoringSort = [...eligible].sort(
    (a, b) => (b.ppg - a.ppg) || (b.total_points - a.total_points),
  );
  const scoring_leader = scoringSort[0] ? toScoringWinner(scoringSort[0]) : null;

  // Defensive POTS — (SPG + BPG), tiebreak total steals+blocks
  const defSort = [...eligible].sort((a, b) => {
    const aVal = a.spg + a.bpg;
    const bVal = b.spg + b.bpg;
    if (bVal !== aVal) return bVal - aVal;
    return (b.steals + b.blocks) - (a.steals + a.blocks);
  });
  const defensive_pots = defSort[0] ? toDefensiveWinner(defSort[0]) : null;

  // All-YMCA 1st/2nd — by fantasy PPG, tiebreak fantasy_points
  const fpSort = [...eligible].sort(
    (a, b) => (b.fpg - a.fpg) || (b.fantasy_points - a.fantasy_points),
  );
  const all_ymca_1st = fpSort.slice(0, 5).map(toAllYmcaWinner);
  const all_ymca_2nd = fpSort.slice(5, 10).map(toAllYmcaWinner);

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

  // Pick the top eligible player (skip anyone under the games-played min)
  let clutch_pots: AwardWinner | null = null;
  for (const row of clutchResult.rows) {
    const pid = row.player_id as string;
    if (!eligibleIds.has(pid)) continue;
    const eligiblePlayer = eligible.find((p) => p.id === pid);
    if (!eligiblePlayer) continue;
    const count = Number(row.game_winners);
    clutch_pots = {
      player_id: pid,
      name: row.name as string,
      value: count,
      value_label: `${count} game-winner${count !== 1 ? "s" : ""}`,
      games_played: eligiblePlayer.games_played,
    };
    break;
  }

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
    all_ymca_1st,
    all_ymca_2nd,
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
