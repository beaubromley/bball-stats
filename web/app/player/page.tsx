"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, LabelList } from "recharts";

import { computeLeagueAvg, computeNBAComp, COMP_HEADING_OVERRIDES } from "@/lib/nba-comps";

const NBA_COMP_HEADING = "NBA Player Comp";
import { formatSeasonGame, getSeasonForGameNumber } from "@/lib/seasons";
import { useAuth } from "@/app/components/AuthProvider";
import HotBadge, { HotStreakInfo } from "@/app/components/HotBadge";
import StreakChart from "@/app/components/StreakChart";

const API_BASE = "/api";

interface PlayerStats {
  id: string;
  name: string;
  games_played: number;
  wins: number;
  losses: number;
  win_pct: number;
  total_points: number;
  ppg: number;
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  apg: number;
  spg: number;
  bpg: number;
  fpg: number;
  ones_pg: number;
  twos_pg: number;
}

interface LeaderboardPlayer {
  id: string;
  ppg: number;
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  games_played: number;
  apg: number;
  spg: number;
  bpg: number;
  twos_pg: number;
  win_pct: number;
  total_points: number;
  fantasy_points: number;
}

interface RecentGame {
  id: string;
  start_time: string;
  result: string;
  team: "A" | "B";
  points_scored: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  team_a_score: number;
  team_b_score: number;
  winning_score: number;
  losing_score: number;
  target_score: number;
  is_mvp: number;
  game_number: number;
}

interface Teammate {
  id: string;
  name: string;
  games_together: number;
  wins_together: number;
  losses_together: number;
  assists_to_teammate: number;
  assists_from_teammate: number;
  win_pct: number;
}

interface BoxScorePlayer {
  player_id: string;
  player_name: string;
  team: "A" | "B";
  points: number;
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  is_mvp: boolean;
}

interface BoxScore {
  game_id: string;
  team_a_score: number;
  team_b_score: number;
  winning_team: string | null;
  players: BoxScorePlayer[];
  mvp: BoxScorePlayer | null;
}

type TeammateSort = "games_together" | "win_pct" | "assists_to_teammate" | "assists_from_teammate" | "synergy";

// Minimum GP to be included in the percentile pool. Below this, a player is
// shown but their *peers* in the comparison are the same eligible group.
const MADDEN_ELIGIBILITY_GP = 5;

interface MaddenRating {
  label: string;
  value: number;          // 50–99
  blurb: string;          // one-line explanation
}
interface MaddenRatings {
  overall: MaddenRating;
  scoring: MaddenRating;
  playmaking: MaddenRating;
  defense: MaddenRating;
  winning: MaddenRating;
  hustle: MaddenRating;
}

/** Map a percentile (0..1) to a 75–99 rating, rounded. Compressed band
 *  reflects that everyone playing in this league is at minimum a solid
 *  starter on a recreational basis — top of the board sits at 93–94,
 *  league median around 87–88, lowest eligible player around 80. */
function pctToRating(p: number): number {
  if (!Number.isFinite(p)) return 75;
  return Math.max(75, Math.min(99, Math.round(75 + p * 24)));
}

/** Compute percentile of a value against a sorted list of all eligible values.
 *  Returns 0..1 — fraction of peers strictly worse than this value. */
function percentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0.5;
  const worse = allValues.filter((v) => v < value).length;
  const equal = allValues.filter((v) => v === value).length;
  // Mid-rank percentile: count strictly-worse + half of ties
  return (worse + equal / 2) / allValues.length;
}

function computeMaddenRatings(
  stats: PlayerStats,
  leaderboard: LeaderboardPlayer[],
): MaddenRatings {
  // Eligible peer pool — exclude rare-appearance players so percentiles aren't
  // skewed by single-game cameos.
  const eligible = leaderboard.filter(
    (p) => p.games_played >= MADDEN_ELIGIBILITY_GP,
  );

  const ppgVals = eligible.map((p) => p.ppg);
  const apgVals = eligible.map((p) => p.apg);
  const defVals = eligible.map((p) => p.spg + p.bpg);
  const winVals = eligible.map((p) => p.win_pct);
  const gpVals = eligible.map((p) => p.games_played);

  const scoring = pctToRating(percentile(stats.ppg, ppgVals));
  const playmaking = pctToRating(percentile(stats.apg, apgVals));
  const defense = pctToRating(percentile(stats.spg + stats.bpg, defVals));
  const winning = pctToRating(percentile(stats.win_pct, winVals));
  const hustle = pctToRating(percentile(stats.games_played, gpVals));

  // Weighted Overall, leaning slightly toward production (scoring + playmaking)
  // but rewarding both ends of the floor and showing up.
  const overall = Math.round(
    scoring * 0.30 +
    playmaking * 0.20 +
    defense * 0.20 +
    winning * 0.20 +
    hustle * 0.10,
  );

  return {
    overall: { label: "Overall", value: overall, blurb: "Weighted blend" },
    scoring: { label: "Scoring", value: scoring, blurb: `${stats.ppg.toFixed(1)} PPG` },
    playmaking: { label: "Playmaking", value: playmaking, blurb: `${stats.apg.toFixed(1)} APG` },
    defense: { label: "Defense", value: defense, blurb: `${(stats.spg + stats.bpg).toFixed(1)} SPG+BPG` },
    winning: { label: "Winning", value: winning, blurb: `${stats.win_pct}% W` },
    hustle: { label: "Hustle", value: hustle, blurb: `${stats.games_played} GP` },
  };
}

/** Color tier — green tops the scale (gold/yellow read as middling at a glance):
 *  90+ emerald (elite), 80+ blue (above average), 70+ amber (average), below 70 gray. */
function ratingTone(value: number): { fg: string; bg: string; ring: string } {
  if (value >= 90) return { fg: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" };
  if (value >= 80) return { fg: "text-blue-400", bg: "bg-blue-500/10", ring: "ring-blue-500/30" };
  if (value >= 70) return { fg: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/30" };
  return { fg: "text-gray-300", bg: "bg-gray-500/10", ring: "ring-gray-500/30" };
}

function MaddenRatingsCard({
  stats,
  leaderboard,
}: {
  stats: PlayerStats;
  leaderboard: LeaderboardPlayer[];
}) {
  if (leaderboard.length === 0) return null;
  const r = computeMaddenRatings(stats, leaderboard);
  const overallTone = ratingTone(r.overall.value);

  // Order matters for the visual hierarchy. Overall first, then production
  // categories, then situational (winning, hustle).
  const categories: MaddenRating[] = [
    r.scoring,
    r.playmaking,
    r.defense,
    r.winning,
    r.hustle,
  ];

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 mb-6 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900/50 dark:to-transparent">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Player Ratings
        </h2>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          75–99 scale · {leaderboard.filter((p) => p.games_played >= MADDEN_ELIGIBILITY_GP).length} peers
        </span>
      </div>
      <div className="flex items-stretch gap-4">
        {/* Overall — large hero */}
        <div className={`flex flex-col items-center justify-center min-w-[88px] py-3 px-3 rounded-lg ${overallTone.bg} ring-1 ${overallTone.ring}`}>
          <div className={`text-5xl font-bold font-display tabular-nums ${overallTone.fg}`}>
            {r.overall.value}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400 mt-1">
            Overall
          </div>
        </div>
        {/* Sub-ratings */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {categories.map((cat) => {
            const tone = ratingTone(cat.value);
            return (
              <div
                key={cat.label}
                className={`flex flex-col items-center py-2 px-2 rounded-lg ${tone.bg}`}
              >
                <div className={`text-2xl font-bold font-display tabular-nums leading-none ${tone.fg}`}>
                  {cat.value}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-1.5">
                  {cat.label}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5 tabular-nums">
                  {cat.blurb}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


function PlayerDetailInner() {
  const { isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [games, setGames] = useState<RecentGame[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [loading, setLoading] = useState(true);
  const [teammateSort, setTeammateSort] = useState<TeammateSort>("games_together");
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [boxScores, setBoxScores] = useState<Record<string, BoxScore>>({});
  const [showAllGames, setShowAllGames] = useState(false);
  /** Page-wide scope toggle. "all" shows lifetime stats; a number filters
   *  every per-game-derived view on this page to games in that season. */
  const [scope, setScope] = useState<"all" | number>("all");
  /** "normalized" = each game stretched to game-to-11 (clincher-aware);
   *  "raw" = actual per-game stat totals. Affects the distribution
   *  histograms only — averages above the charts also restate. */
  const [distMode, setDistMode] = useState<"normalized" | "raw">("normalized");
  const [sosTable, setSosTable] = useState<
    { player_id: string; sos_index: number; games_rated: number }[]
  >([]);
  const [hotInfo, setHotInfo] = useState<HotStreakInfo | undefined>(undefined);
  const [clutchMine, setClutchMine] = useState<{
    clutch_games: number;
    clutch_pts: number;
    clutch_ast: number;
    clutch_stl: number;
    clutch_blk: number;
    clutch_fp: number;
    clutch_fp_pg: number;
  } | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetch(`${API_BASE}/players/${id}/stats`).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`${API_BASE}/players/${id}/games`).then((r) => r.json()),
      fetch(`${API_BASE}/players`).then((r) => r.json()),
      fetch(`${API_BASE}/players/${id}/teammates`).then((r) => r.json()).catch(() => []),
    ])
      .then(([s, g, lb, tm]) => {
        setStats(s);
        setGames(g);
        setLeaderboard(lb);
        setTeammates(tm);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Pull this player's hot-streak entry, if any.
    fetch(`${API_BASE}/hot-streaks`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: { player_id: string; last5_fpg: number; career_fpg: number; ratio: number }[]) => {
        if (!Array.isArray(arr)) return;
        const mine = arr.find((r) => r.player_id === id);
        setHotInfo(mine ? { last5_fpg: mine.last5_fpg, career_fpg: mine.career_fpg, ratio: mine.ratio } : undefined);
      })
      .catch(() => {});
  }, [id]);

  // SoS is fetched separately so it can refetch when the season scope
  // changes without re-firing the heavier player-stats / games / leaderboard
  // calls.
  useEffect(() => {
    const seasonParam = scope === "all" ? "" : `?season=${scope}`;
    // Clutch — filters with scope so the player's clutch line matches
    // whichever season pill is active.
    fetch(`${API_BASE}/clutch-stats${seasonParam}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (!Array.isArray(arr) || !id) return;
        const mine = arr.find((r) => r.player_id === id);
        setClutchMine(mine ?? null);
      })
      .catch(() => {});

    fetch(`${API_BASE}/strength-of-schedule${seasonParam}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((sos) => setSosTable(Array.isArray(sos) ? sos : []))
      .catch(() => {});
  }, [scope]);

  async function toggleGame(gameId: string) {
    if (expandedGame === gameId) {
      setExpandedGame(null);
      return;
    }
    setExpandedGame(gameId);
    if (!boxScores[gameId]) {
      try {
        const bs = await fetch(`${API_BASE}/games/${gameId}/boxscore`).then((r) => r.json());
        setBoxScores((prev) => ({ ...prev, [gameId]: bs }));
      } catch {
        // ignore
      }
    }
  }

  if (loading) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  if (!stats) {
    return (
      <div className="text-gray-500 text-center py-16">Player not found.</div>
    );
  }

  // Normalize stats to game-to-11
  const norm = (raw: number, ws: number) => raw * 11 / Math.max(ws, 1);

  // Seasons the player actually appeared in — drives the toggle pill row.
  const seasonsPlayed = Array.from(
    new Set(games.map((g) => getSeasonForGameNumber(Number(g.game_number))))
  ).sort((a, b) => a - b);

  // Filter games to the chosen scope. Every per-game-derived view below
  // (distributions, streaks, top game, MVP count, scoped stats) reads
  // from this array so the toggle filters the whole page.
  const scopedGames =
    scope === "all"
      ? games
      : games.filter(
          (g) => getSeasonForGameNumber(Number(g.game_number)) === scope,
        );

  // Per-game stat arrays for distribution charts. Toggle picks between:
  //  • normalized: each game stretched to game-to-11 using the clincher
  //    rule (so a 12-7 game isn't diluted — target+1 vs <target-1 keeps
  //    raw values; real overtime-feel games like 14-11 still scale).
  //  • raw: actual per-game stat totals, no rescaling.
  const perGame = scopedGames.map((g) => {
    if (distMode === "raw") {
      const pts = Number(g.points_scored);
      const ast = Number(g.assists);
      const stl = Number(g.steals);
      const blk = Number(g.blocks);
      return { pts, ast, stl, blk, fp: pts + ast + stl + blk };
    }
    const w = Number(g.winning_score) || 11;
    const l = Number(g.losing_score) || 0;
    const t = Number(g.target_score) || 11;
    const ws = w === t + 1 && l < t - 1 ? t : w;
    const pts = Math.round(norm(Number(g.points_scored), ws));
    const ast = Math.round(norm(Number(g.assists), ws));
    const stl = Math.round(norm(Number(g.steals), ws));
    const blk = Math.round(norm(Number(g.blocks), ws));
    return { pts, ast, stl, blk, fp: pts + ast + stl + blk };
  });

  // Longest win/loss streaks (walk this player's games chronologically)
  const streaks = (() => {
    if (scopedGames.length === 0) return { longestWin: 0, longestLoss: 0 };
    const sorted = [...scopedGames].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
    let longestWin = 0;
    let longestLoss = 0;
    let curW = 0;
    let curL = 0;
    for (const g of sorted) {
      if (g.result === "W") {
        curW += 1;
        curL = 0;
        if (curW > longestWin) longestWin = curW;
      } else {
        curL += 1;
        curW = 0;
        if (curL > longestLoss) longestLoss = curL;
      }
    }
    return { longestWin, longestLoss };
  })();

  // Rank this player among all leaderboard players for a given numeric stat.
  // Uses dense ranking: ties share the same rank.
  function rankFor(key: keyof LeaderboardPlayer): { rank: number; total: number } | null {
    if (!leaderboard.length || !id) return null;
    const me = leaderboard.find((p) => p.id === id);
    if (!me) return null;
    const myVal = Number(me[key]);
    const sorted = [...leaderboard]
      .map((p) => Number(p[key]))
      .sort((a, b) => b - a);
    const better = sorted.filter((v) => v > myVal).length;
    return { rank: better + 1, total: leaderboard.length };
  }

  function buildHistogram(values: number[]): { bucket: string; count: number; value: number }[] {
    if (values.length === 0) return [];
    const max = Math.max(...values);
    const buckets = new Map<number, number>();
    for (let i = 0; i <= max; i++) buckets.set(i, 0);
    for (const v of values) buckets.set(v, (buckets.get(v) || 0) + 1);
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([val, count]) => ({ bucket: String(val), count, value: val }));
  }

  // Top game: highest fantasy_points among games; tiebreak by most recent
  const topGame = scopedGames.length > 0
    ? [...scopedGames].sort((a, b) => (b.fantasy_points - a.fantasy_points) || (b.start_time.localeCompare(a.start_time)))[0]
    : null;

  const mvpGames = scopedGames.filter((g) => g.is_mvp === 1);
  const mvpCount = mvpGames.length;

  // Sorted teammates (at least 2 games together to matter)
  const filteredTeammates = teammates.filter((t) => t.games_together >= 2);
  const sortedTeammates = [...filteredTeammates].sort((a, b) => {
    if (teammateSort === "synergy") {
      return (b.assists_to_teammate + b.assists_from_teammate) - (a.assists_to_teammate + a.assists_from_teammate);
    }
    return (b[teammateSort] as number) - (a[teammateSort] as number);
  });

  // Stats projected onto the current scope. For "all" this is identical
  // to the lifetime stats from the API; otherwise everything is rebuilt
  // from the season's games so totals/averages match the filter.
  const scopedStats: PlayerStats = (() => {
    if (scope === "all") return stats;
    const n = scopedGames.length;
    const round1 = (x: number) => Math.round(x * 10) / 10;
    const wins = scopedGames.filter((g) => g.result === "W").length;
    const losses = n - wins;
    const total_points = scopedGames.reduce((s, g) => s + Number(g.points_scored), 0);
    const twos_made = scopedGames.reduce((s, g) => s + Number(g.twos_made ?? 0), 0);
    // Twos contribute 2 pts each; everything else is a 1-pointer. This
    // matches the 1s2s scoring mode rollup table.
    const ones_made = total_points - 2 * twos_made;
    const assists = scopedGames.reduce((s, g) => s + Number(g.assists), 0);
    const steals = scopedGames.reduce((s, g) => s + Number(g.steals), 0);
    const blocks = scopedGames.reduce((s, g) => s + Number(g.blocks), 0);
    const fantasy_points = scopedGames.reduce((s, g) => s + Number(g.fantasy_points), 0);

    // Mirror refreshGameStats: each game contributes (effective_winning / 11)
    // effective games, where effective_winning collapses target+1 clincher
    // games back to target. Per-game averages then divide by the SUM of
    // those effective games — matching the all-time leaderboard math.
    const effectiveGames = scopedGames.reduce((s, g) => {
      const w = Number(g.winning_score) || 11;
      const l = Number(g.losing_score) || 0;
      const t = Number(g.target_score) || 11;
      const eff = w === t + 1 && l < t - 1 ? t : w;
      return s + (eff || 11) / 11;
    }, 0);
    const eg = effectiveGames || 1;

    return {
      id: stats.id,
      name: stats.name,
      games_played: n,
      wins,
      losses,
      win_pct: n > 0 ? Math.round((wins / n) * 100) : 0,
      total_points,
      ppg: round1(total_points / eg),
      ones_made,
      twos_made,
      assists,
      steals,
      blocks,
      fantasy_points,
      apg: round1(assists / eg),
      spg: round1(steals / eg),
      bpg: round1(blocks / eg),
      fpg: round1(fantasy_points / eg),
      ones_pg: round1(ones_made / eg),
      twos_pg: round1(twos_made / eg),
    };
  })();

  // Per-game averages flow from scopedStats — same numbers in lifetime
  // mode, the season's averages otherwise.
  const playerPerGame = {
    ppg: scopedStats.ppg,
    tpg: scopedStats.twos_pg,
    apg: scopedStats.apg,
    spg: scopedStats.spg,
    bpg: scopedStats.bpg,
  };

  // League average stays all-time — it's a stable scaling baseline. Switching
  // the player's window to a season doesn't change what an "average player"
  // looks like for the comp algorithm.
  const leagueAvg = computeLeagueAvg(leaderboard);
  const { comp, scaledStats } = computeNBAComp(
    playerPerGame,
    leagueAvg,
    undefined,
    stats.name,
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-6">
        <h1 className="text-3xl font-bold font-display tracking-wide">
          {stats.name}
          <HotBadge info={hotInfo} />
        </h1>
        {seasonsPlayed.length > 0 && (
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`px-3 py-1.5 rounded ${
                scope === "all"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              All-Time
            </button>
            {seasonsPlayed.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded ${
                  scope === s
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                }`}
              >
                S{s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Per-Game Averages & NBA Scaled Stats side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Per-Game Averages</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
            {[
              { label: "PPG", value: playerPerGame.ppg },
              { label: "3PG", value: playerPerGame.tpg },
              { label: "APG", value: playerPerGame.apg },
              { label: "SPG", value: playerPerGame.spg },
              { label: "BPG", value: playerPerGame.bpg },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xl font-bold font-display tabular-nums">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">NBA Scaled Stats</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
            {[
              { label: "PPG", value: scaledStats.ppg },
              { label: "3PG", value: scaledStats.tpg },
              { label: "APG", value: scaledStats.apg },
              { label: "SPG", value: scaledStats.spg },
              { label: "BPG", value: scaledStats.bpg },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xl font-bold font-display tabular-nums">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* NBA Player Comp */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 mb-6 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900/50 dark:to-transparent">
        <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          {COMP_HEADING_OVERRIDES[stats.name] ?? NBA_COMP_HEADING}
        </h2>
        <div className="mb-3 flex items-baseline gap-3 flex-wrap">
          <span className="text-2xl font-bold font-display">{comp.name}</span>
          {(comp.team || comp.pos) && (
            <span className="text-sm font-display uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {[comp.team, comp.pos].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        <div className="flex gap-6 text-sm flex-wrap">
          <div><span className="font-bold tabular-nums">{comp.ppg}</span> <span className="text-gray-500">PPG</span></div>
          <div><span className="font-bold tabular-nums">{comp.tpg}</span> <span className="text-gray-500">3PT</span></div>
          <div><span className="font-bold tabular-nums">{comp.apg}</span> <span className="text-gray-500">APG</span></div>
          <div><span className="font-bold tabular-nums">{comp.spg}</span> <span className="text-gray-500">SPG</span></div>
          <div><span className="font-bold tabular-nums">{comp.bpg}</span> <span className="text-gray-500">BPG</span></div>
        </div>
      </div>

      {/* Madden ratings — percentile-mapped 50–99 scale against the eligible
          leaderboard (>=5 GP). Recomputed live from leaderboard each render.
          Admin-only: ratings are opinionated/comparative and not for public
          display until the formula has been polished and approved. */}
      {isAdmin && <MaddenRatingsCard stats={scopedStats} leaderboard={leaderboard} />}

      {/* Clutch — performance when leading team ≥ target-2 AND margin ≤ 2 */}
      {clutchMine && clutchMine.clutch_games > 0 && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 mb-6">
          <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Clutch {scope !== "all" && <span className="text-gray-400">· Season {scope}</span>}
          </h2>
          <div className="flex items-baseline gap-3 flex-wrap mb-3">
            <span className="text-3xl font-bold font-display tabular-nums">{clutchMine.clutch_fp_pg.toFixed(2)}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              clutch FP/game across {clutchMine.clutch_games} clutch game{clutchMine.clutch_games !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {[
              { label: "PTS", value: clutchMine.clutch_pts },
              { label: "AST", value: clutchMine.clutch_ast },
              { label: "STL", value: clutchMine.clutch_stl },
              { label: "BLK", value: clutchMine.clutch_blk },
              { label: "FP", value: clutchMine.clutch_fp },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-lg font-bold font-display tabular-nums">{value}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
          <div
            className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 cursor-help"
            title={
              "A play counts as clutch if, at the moment it happens, the " +
              "leading team's score is within 2 of target AND the margin " +
              "is 2 or less. Stats are totals from those plays; clutch " +
              "games count any game where clutch time occurred."
            }
          >
            Score within 2 of target and ≤ 2-point margin.
          </div>
        </div>
      )}

      {/* Strength of Schedule — filters with the page-wide season toggle */}
      {(() => {
        const mine = sosTable.find((s) => s.player_id === id);
        if (!mine || mine.games_rated === 0) return null;
        // Dense rank among players with ≥10 rated games — small samples
        // are noisy and crowd the top/bottom of the list.
        const eligible = sosTable.filter((s) => s.games_rated >= 10);
        const sortedDesc = [...eligible].sort((a, b) => b.sos_index - a.sos_index);
        const rank = sortedDesc.findIndex((s) => s.player_id === id) + 1;
        const showRank = rank > 0 && mine.games_rated >= 10;
        return (
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 mb-6">
            <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Strength of Schedule {scope !== "all" && <span className="text-gray-400">· Season {scope}</span>}
            </h2>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-bold font-display tabular-nums">{mine.sos_index}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {mine.sos_index > 50
                  ? "tougher than average"
                  : mine.sos_index < 50
                  ? "easier than average"
                  : "neutral"}
                {showRank && (
                  <> · rank <span className="text-gray-700 dark:text-gray-300 font-bold">#{rank}</span> of {sortedDesc.length}</>
                )}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
              Avg opponent pre-game win% across {mine.games_rated} rated games. 50 = neutral, higher = tougher.
            </div>
          </div>
        );
      })()}


      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Win %", value: `${scopedStats.win_pct}%`, rank: scope === "all" ? rankFor("win_pct") : null },
          { label: "PPG", value: String(scopedStats.ppg), rank: scope === "all" ? rankFor("ppg") : null },
          { label: "Record", value: `${scopedStats.wins}-${scopedStats.losses}`, rank: null },
          { label: "Total Pts", value: String(scopedStats.total_points), rank: scope === "all" ? rankFor("total_points") : null },
          { label: "AST", value: String(scopedStats.assists), rank: scope === "all" ? rankFor("assists") : null },
          { label: "STL", value: String(scopedStats.steals), rank: scope === "all" ? rankFor("steals") : null },
          { label: "BLK", value: String(scopedStats.blocks), rank: scope === "all" ? rankFor("blocks") : null },
          { label: "Fantasy Pts", value: String(scopedStats.fantasy_points), rank: scope === "all" ? rankFor("fantasy_points") : null },
          { label: "Longest W Streak", value: String(streaks.longestWin), rank: null },
          { label: "Longest L Streak", value: String(streaks.longestLoss), rank: null },
        ].map(({ label, value, rank }) => (
          <div
            key={label}
            className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 text-center"
          >
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className="text-2xl font-bold font-display tabular-nums">{value}</div>
            {rank && (
              <div className="text-[10px] text-gray-500 mt-1 font-display uppercase tracking-wider tabular-nums">
                #{rank.rank} of {rank.total}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-8">
        <h2 className="text-sm text-gray-500 dark:text-gray-400 mb-3">Shooting</h2>
        <div className="flex gap-8">
          <div>
            <span className="text-2xl font-bold tabular-nums">
              {scopedStats.ones_made}
            </span>
            <span className="text-gray-500 text-sm ml-2">1-pointers</span>
          </div>
          <div>
            <span className="text-2xl font-bold tabular-nums">
              {scopedStats.twos_made}
            </span>
            <span className="text-gray-500 text-sm ml-2">2-pointers</span>
          </div>
        </div>
      </div>

      {/* Recent Form — last 10 games of FP/G vs career baseline with hot/cold
          ranges. All-time (not affected by the season scope toggle). */}
      <StreakChart games={games} />

      {perGame.length > 1 && (() => {
        const distributions: { label: string; key: keyof typeof perGame[0]; color: string; avg: string }[] = [
          { label: "Points", key: "pts", color: "#3B82F6", avg: (perGame.reduce((s, g) => s + g.pts, 0) / perGame.length).toFixed(1) },
          { label: "Assists", key: "ast", color: "#10B981", avg: (perGame.reduce((s, g) => s + g.ast, 0) / perGame.length).toFixed(1) },
          { label: "Steals", key: "stl", color: "#F59E0B", avg: (perGame.reduce((s, g) => s + g.stl, 0) / perGame.length).toFixed(1) },
          { label: "Blocks", key: "blk", color: "#A855F7", avg: (perGame.reduce((s, g) => s + g.blk, 0) / perGame.length).toFixed(1) },
          { label: "Fantasy Points", key: "fp", color: "#EF4444", avg: (perGame.reduce((s, g) => s + g.fp, 0) / perGame.length).toFixed(1) },
        ];
        return (
          <div className="mb-8">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
              <h2 className="text-xl font-bold font-display uppercase tracking-wide">Distributions</h2>
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setDistMode("normalized")}
                  className={`px-3 py-1 rounded ${
                    distMode === "normalized"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  Game-to-11
                </button>
                <button
                  type="button"
                  onClick={() => setDistMode("raw")}
                  className={`px-3 py-1 rounded ${
                    distMode === "raw"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  Raw totals
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {distributions.map(({ label, key, color, avg }) => {
                const histData = buildHistogram(perGame.map((g) => g[key]));
                if (histData.length === 0) return null;
                const maxCount = Math.max(...histData.map((d) => d.count));
                const totalGames = perGame.length;
                return (
                  <div key={label} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
                    <div className="flex items-baseline justify-between mb-2">
                      <h3 className="text-sm text-gray-500 dark:text-gray-400">{label}</h3>
                      <span className="text-xs text-gray-400">avg {avg}</span>
                    </div>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={histData} margin={{ left: 0, right: 0, top: 16, bottom: 0 }}>
                        <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#6B7280" }} tickLine={false} axisLine={false} />
                        <YAxis hide allowDecimals={false} domain={[0, maxCount + 1]} />
                        <Tooltip
                          cursor={false}
                          contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px" }}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => {
                            const n = Number(value);
                            const pct = Math.round((n / totalGames) * 100);
                            return [`${n} game${n !== 1 ? "s" : ""} (${pct}%)`, ""];
                          }}
                          labelFormatter={(l) => `${label}: ${l}`}
                        />
                        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                          {histData.map((_, i) => (
                            <Cell key={i} fill={color} fillOpacity={0.7} />
                          ))}
                          <LabelList
                            dataKey="count"
                            position="top"
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any) => {
                              const n = Number(value);
                              if (!n) return "";
                              return `${Math.round((n / totalGames) * 100)}%`;
                            }}
                            style={{ fontSize: 10, fill: "#6B7280", fontVariantNumeric: "tabular-nums" }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Top Game + MVP Summary */}
      {topGame && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="border border-yellow-300/30 dark:border-yellow-700/30 rounded-lg p-5 bg-yellow-50/50 dark:bg-yellow-900/5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs text-yellow-600 dark:text-yellow-500 uppercase tracking-wider">Top Game</h2>
              {topGame.is_mvp === 1 && (
                <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded">MVP</span>
              )}
            </div>
            <Link href={`/game?id=${topGame.id}`} className="block">
              <div className="flex items-baseline gap-3 mb-3">
                <span className={`text-2xl font-bold ${topGame.result === "W" ? "text-green-400" : "text-red-400"}`}>
                  {topGame.result}
                </span>
                <span className="text-2xl font-bold font-display tabular-nums">
                  {topGame.team_a_score}-{topGame.team_b_score}
                </span>
                <span className="text-sm text-gray-500 ml-auto tabular-nums">{formatSeasonGame(topGame.game_number)}</span>
              </div>
              <div className="flex gap-4 text-sm flex-wrap">
                <div><span className="font-bold tabular-nums">{Number(topGame.points_scored)}</span> <span className="text-gray-500">PTS</span></div>
                <div><span className="font-bold tabular-nums">{Number(topGame.assists)}</span> <span className="text-gray-500">AST</span></div>
                <div><span className="font-bold tabular-nums">{Number(topGame.steals)}</span> <span className="text-gray-500">STL</span></div>
                <div><span className="font-bold tabular-nums">{Number(topGame.blocks)}</span> <span className="text-gray-500">BLK</span></div>
                <div className="text-blue-400"><span className="font-bold tabular-nums">{Number(topGame.fantasy_points)}</span> <span className="opacity-70">FP</span></div>
              </div>
            </Link>
          </div>

          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">MVP Awards</h2>
              <span className="text-3xl font-bold font-display text-yellow-400 tabular-nums">{mvpCount}</span>
            </div>
            {mvpCount === 0 ? (
              <p className="text-sm text-gray-500">No MVPs yet.</p>
            ) : (
              <div className="text-xs text-gray-500 mb-2">
                {mvpCount} of {games.length} games ({Math.round(mvpCount * 100 / games.length)}%)
              </div>
            )}
            {mvpGames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {mvpGames.slice(0, 12).map((g) => (
                  <Link
                    key={g.id}
                    href={`/game?id=${g.id}`}
                    className="text-[11px] px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20 tabular-nums"
                  >
                    {formatSeasonGame(g.game_number)}
                  </Link>
                ))}
                {mvpGames.length > 12 && (
                  <span className="text-[11px] px-2 py-0.5 text-gray-500">+{mvpGames.length - 12} more</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Teammates */}
      {sortedTeammates.length > 0 && (
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xl font-bold font-display uppercase tracking-wide">Top Teammates</h2>
            <div className="flex gap-1 flex-wrap text-[11px]">
              {([
                { key: "games_together", label: "GP" },
                { key: "win_pct", label: "Win%" },
                { key: "assists_to_teammate", label: "AST to" },
                { key: "assists_from_teammate", label: "AST from" },
                { key: "synergy", label: "Tot AST" },
              ] as { key: TeammateSort; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTeammateSort(key)}
                  className={`px-2 py-0.5 rounded font-display uppercase tracking-wide transition-colors ${
                    teammateSort === key
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-500 text-xs font-display uppercase tracking-wider">
                  <th className="py-2 pr-3 text-left">Teammate</th>
                  <th className="py-2 pr-3 text-right">GP</th>
                  <th className="py-2 pr-3 text-right">W-L</th>
                  <th className="py-2 pr-3 text-right">Win%</th>
                  <th className="py-2 pr-3 text-right">AST to</th>
                  <th className="py-2 pr-3 text-right">AST from</th>
                  <th className="py-2 text-right">Tot AST</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeammates.slice(0, 15).map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 dark:border-gray-900">
                    <td className="py-2 pr-3">
                      <Link href={`/player?id=${t.id}`} className="text-blue-400 hover:text-blue-300">
                        {t.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{t.games_together}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{t.wins_together}-{t.losses_together}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${t.win_pct >= 60 ? "text-green-400" : t.win_pct < 50 ? "text-red-400" : ""}`}>{t.win_pct}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{t.assists_to_teammate}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{t.assists_from_teammate}</td>
                    <td className="py-2 text-right tabular-nums font-bold text-blue-400">{t.assists_to_teammate + t.assists_from_teammate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Games with expandable box scores */}
      <h2 className="text-xl font-bold font-display uppercase tracking-wide mb-4">Recent Games</h2>
      {games.length === 0 ? (
        <p className="text-gray-500">No finished games yet.</p>
      ) : (
        <div>
          <div className="space-y-1">
            {(showAllGames ? games : games.slice(0, 10)).map((game) => {
              const isExpanded = expandedGame === game.id;
              const bs = boxScores[game.id];
              const myTeam = game.team;
              const oppTeam = myTeam === "A" ? "B" : "A";
              const myScore = myTeam === "A" ? game.team_a_score : game.team_b_score;
              const oppScore = myTeam === "A" ? game.team_b_score : game.team_a_score;
              return (
                <div key={game.id} className="border-b border-gray-100 dark:border-gray-900">
                  <button
                    onClick={() => toggleGame(game.id)}
                    className="w-full flex items-center gap-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 px-2 -mx-2 rounded transition-colors"
                  >
                    <span className={`font-bold text-sm w-6 ${game.result === "W" ? "text-green-400" : "text-red-400"}`}>
                      {game.result}
                    </span>
                    <span className="tabular-nums font-medium text-sm w-14">
                      {myScore}-{oppScore}
                    </span>
                    <span className="flex-1 text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                      {formatSeasonGame(game.game_number)}
                    </span>
                    <span className="flex gap-3 text-xs text-gray-500 tabular-nums">
                      <span><b className="text-gray-700 dark:text-gray-300">{Number(game.points_scored)}</b> pts</span>
                      <span><b className="text-gray-700 dark:text-gray-300">{Number(game.assists)}</b> a</span>
                      <span className="text-blue-400"><b>{Number(game.fantasy_points)}</b> fp</span>
                    </span>
                    {game.is_mvp === 1 && (
                      <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded">MVP</span>
                    )}
                    <span className="text-gray-400 text-xs">{isExpanded ? "▴" : "▾"}</span>
                  </button>
                  {isExpanded && (
                    <div className="pb-4 pt-1 pl-2 pr-2">
                      {!bs ? (
                        <div className="text-xs text-gray-500 py-2">Loading box score…</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[myTeam, oppTeam].map((team) => {
                            const teamPlayers = bs.players.filter((p) => p.team === team);
                            const teamScore = team === "A" ? bs.team_a_score : bs.team_b_score;
                            const isWinner = bs.winning_team === team;
                            return (
                              <div key={team} className={`border rounded-lg p-3 ${team === myTeam ? "border-blue-300/40 dark:border-blue-700/40" : "border-gray-200 dark:border-gray-800"}`}>
                                <div className="flex items-baseline justify-between mb-2 text-xs">
                                  <span className="font-display uppercase tracking-wide text-gray-500">
                                    Team {team} {team === myTeam && "(You)"}
                                  </span>
                                  <span className={`font-bold text-base tabular-nums ${isWinner ? "text-green-400" : "text-gray-400"}`}>
                                    {teamScore}
                                  </span>
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-200 dark:border-gray-800">
                                      <th className="py-1 text-left font-normal">Player</th>
                                      <th className="py-1 text-right font-normal">PTS</th>
                                      <th className="py-1 text-right font-normal">AST</th>
                                      <th className="py-1 text-right font-normal">STL</th>
                                      <th className="py-1 text-right font-normal">BLK</th>
                                      <th className="py-1 text-right font-normal">FP</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {teamPlayers.map((p) => (
                                      <tr key={p.player_id} className={p.player_id === id ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                                        <td className="py-1 pr-2">
                                          <span className="flex items-center gap-1">
                                            {p.player_name}
                                            {p.is_mvp && <span className="text-[9px] text-yellow-400">★</span>}
                                          </span>
                                        </td>
                                        <td className="py-1 text-right tabular-nums">{p.points}</td>
                                        <td className="py-1 text-right tabular-nums">{p.assists}</td>
                                        <td className="py-1 text-right tabular-nums">{p.steals}</td>
                                        <td className="py-1 text-right tabular-nums">{p.blocks}</td>
                                        <td className="py-1 text-right tabular-nums text-blue-400">{p.fantasy_points}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-2 text-right">
                        <Link href={`/game?id=${game.id}`} className="text-xs text-blue-400 hover:text-blue-300">View full game →</Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {games.length > 10 && (
            <button
              onClick={() => setShowAllGames(!showAllGames)}
              className="mt-4 text-sm text-blue-400 hover:text-blue-300"
            >
              {showAllGames ? "Show less" : `Show all ${games.length} games`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="text-gray-500 text-center py-16">Loading...</div>
      }
    >
      <PlayerDetailInner />
    </Suspense>
  );
}
