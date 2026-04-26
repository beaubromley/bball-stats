"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, LabelList } from "recharts";

import { computeLeagueAvg, computeNBAComp } from "@/lib/nba-comps";
import { GAMES_PER_SEASON } from "@/lib/seasons";

function formatSeasonGame(gameNumber: number): string {
  if (!gameNumber || gameNumber < 1) return "";
  const season = Math.ceil(gameNumber / GAMES_PER_SEASON);
  const gameInSeason = ((gameNumber - 1) % GAMES_PER_SEASON) + 1;
  return `S${season} · G${gameInSeason}`;
}

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
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  team_a_score: number;
  team_b_score: number;
  winning_score: number;
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

function PlayerDetailInner() {
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
  }, [id]);

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

  // Per-game stat arrays for distribution charts (normalized to game-to-11)
  const perGame = games.map((g) => {
    const ws = Number(g.winning_score) || 11;
    const pts = Math.round(norm(Number(g.points_scored), ws));
    const ast = Math.round(norm(Number(g.assists), ws));
    const stl = Math.round(norm(Number(g.steals), ws));
    const blk = Math.round(norm(Number(g.blocks), ws));
    return { pts, ast, stl, blk, fp: pts + ast + stl + blk };
  });

  // Longest win/loss streaks (walk this player's games chronologically)
  const streaks = (() => {
    if (games.length === 0) return { longestWin: 0, longestLoss: 0 };
    const sorted = [...games].sort((a, b) =>
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
  const topGame = games.length > 0
    ? [...games].sort((a, b) => (b.fantasy_points - a.fantasy_points) || (b.start_time.localeCompare(a.start_time)))[0]
    : null;

  const mvpGames = games.filter((g) => g.is_mvp === 1);
  const mvpCount = mvpGames.length;

  // Sorted teammates (at least 2 games together to matter)
  const filteredTeammates = teammates.filter((t) => t.games_together >= 2);
  const sortedTeammates = [...filteredTeammates].sort((a, b) => {
    if (teammateSort === "synergy") {
      return (b.assists_to_teammate + b.assists_from_teammate) - (a.assists_to_teammate + a.assists_from_teammate);
    }
    return (b[teammateSort] as number) - (a[teammateSort] as number);
  });

  // ── Per-game averages & NBA comp (all normalized to game-to-11) ──
  const playerPerGame = {
    ppg: stats.ppg,
    tpg: stats.twos_pg,
    apg: stats.apg,
    spg: stats.spg,
    bpg: stats.bpg,
  };
  const leagueAvg = computeLeagueAvg(leaderboard);
  const { comp, scaledStats } = computeNBAComp(playerPerGame, leagueAvg);

  return (
    <div>
      <h1 className="text-3xl font-bold font-display tracking-wide mb-6">{stats.name}</h1>

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
        <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">NBA Player Comp</h2>
        <div className="mb-3">
          <span className="text-2xl font-bold font-display">{comp.name}</span>
        </div>
        <div className="flex gap-6 text-sm flex-wrap">
          <div><span className="font-bold tabular-nums">{comp.ppg}</span> <span className="text-gray-500">PPG</span></div>
          <div><span className="font-bold tabular-nums">{comp.tpg}</span> <span className="text-gray-500">3PT</span></div>
          <div><span className="font-bold tabular-nums">{comp.apg}</span> <span className="text-gray-500">APG</span></div>
          <div><span className="font-bold tabular-nums">{comp.spg}</span> <span className="text-gray-500">SPG</span></div>
          <div><span className="font-bold tabular-nums">{comp.bpg}</span> <span className="text-gray-500">BPG</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Win %", value: `${stats.win_pct}%`, rank: rankFor("win_pct") },
          { label: "PPG", value: String(stats.ppg), rank: rankFor("ppg") },
          { label: "Record", value: `${stats.wins}-${stats.losses}`, rank: null },
          { label: "Total Pts", value: String(stats.total_points), rank: rankFor("total_points") },
          { label: "AST", value: String(stats.assists), rank: rankFor("assists") },
          { label: "STL", value: String(stats.steals), rank: rankFor("steals") },
          { label: "BLK", value: String(stats.blocks), rank: rankFor("blocks") },
          { label: "Fantasy Pts", value: String(stats.fantasy_points), rank: rankFor("fantasy_points") },
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
              {stats.ones_made}
            </span>
            <span className="text-gray-500 text-sm ml-2">1-pointers</span>
          </div>
          <div>
            <span className="text-2xl font-bold tabular-nums">
              {stats.twos_made}
            </span>
            <span className="text-gray-500 text-sm ml-2">2-pointers</span>
          </div>
        </div>
      </div>

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
            <h2 className="text-xl font-bold font-display uppercase tracking-wide mb-4">Distributions</h2>
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
