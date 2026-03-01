"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";

import { formatShortDateCT } from "@/lib/time";
import { computeLeagueAvg, computeNBAComp } from "@/lib/nba-comps";

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
}

interface LeaderboardPlayer {
  id: string;
  ppg: number;
  assists: number;
  steals: number;
  blocks: number;
  games_played: number;
}

interface RecentGame {
  id: string;
  start_time: string;
  result: string;
  points_scored: number;
  assists: number;
  steals: number;
  blocks: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm">
      <p className="text-gray-300">{label}</p>
      <p className="text-blue-400 font-medium">{payload[0].value} pts</p>
    </div>
  );
}

function PlayerDetailInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [games, setGames] = useState<RecentGame[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);

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
    ])
      .then(([s, g, lb]) => {
        setStats(s);
        setGames(g);
        setLeaderboard(lb);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  if (!stats) {
    return (
      <div className="text-gray-500 text-center py-16">Player not found.</div>
    );
  }

  const chartData = games
    .slice()
    .reverse()
    .map((g) => ({
      date: formatShortDateCT(g.start_time),
      pts: Number(g.points_scored),
    }));

  // Per-game stat arrays for distribution charts
  const perGame = games.map((g) => {
    const pts = Number(g.points_scored);
    const ast = Number(g.assists);
    const stl = Number(g.steals);
    const blk = Number(g.blocks);
    return { pts, ast, stl, blk, fp: pts + ast + stl + blk };
  });

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

  // ── Per-game averages & NBA comp ──
  const gp = stats.games_played || 1;
  const playerPerGame = {
    ppg: stats.ppg,
    apg: Math.round((stats.assists / gp) * 10) / 10,
    spg: Math.round((stats.steals / gp) * 10) / 10,
    bpg: Math.round((stats.blocks / gp) * 10) / 10,
  };

  const leagueAvg = computeLeagueAvg(leaderboard);
  const { comp, scaledStats } = computeNBAComp(playerPerGame, leagueAvg);

  return (
    <div>
      <h1 className="text-3xl font-bold font-display tracking-wide mb-6">{stats.name}</h1>

      {/* NBA Player Comp */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 mb-6 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900/50 dark:to-transparent">
        <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">NBA Player Comp</h2>
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-2xl font-bold font-display">{comp.name}</span>
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{comp.team}</span>
        </div>
        <div className="flex gap-6 text-sm">
          <div><span className="font-bold tabular-nums">{comp.ppg}</span> <span className="text-gray-500">PPG</span></div>
          <div><span className="font-bold tabular-nums">{comp.apg}</span> <span className="text-gray-500">APG</span></div>
          <div><span className="font-bold tabular-nums">{comp.spg}</span> <span className="text-gray-500">SPG</span></div>
          <div><span className="font-bold tabular-nums">{comp.bpg}</span> <span className="text-gray-500">BPG</span></div>
        </div>
      </div>

      {/* Per-Game Averages & NBA Scaled Stats side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Per-Game Averages</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "PPG", value: playerPerGame.ppg },
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
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "PPG", value: scaledStats.ppg },
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Win %", value: `${stats.win_pct}%` },
          { label: "PPG", value: String(stats.ppg) },
          { label: "Record", value: `${stats.wins}-${stats.losses}` },
          { label: "Total Pts", value: String(stats.total_points) },
          { label: "AST", value: String(stats.assists) },
          { label: "STL", value: String(stats.steals) },
          { label: "BLK", value: String(stats.blocks) },
          { label: "Fantasy Pts", value: String(stats.fantasy_points) },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 text-center"
          >
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className="text-2xl font-bold font-display tabular-nums">{value}</div>
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

      {chartData.length > 1 && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-8 bg-white dark:bg-transparent">
          <h2 className="text-sm text-gray-500 dark:text-gray-400 mb-3">Scoring Trend</h2>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6B7280" }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="pts" stroke="#3B82F6" fill="rgba(59,130,246,0.2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

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
                return (
                  <div key={label} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
                    <div className="flex items-baseline justify-between mb-2">
                      <h3 className="text-sm text-gray-500 dark:text-gray-400">{label}</h3>
                      <span className="text-xs text-gray-400">avg {avg}</span>
                    </div>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={histData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                        <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#6B7280" }} tickLine={false} axisLine={false} />
                        <YAxis hide allowDecimals={false} domain={[0, maxCount + 1]} />
                        <Tooltip
                          cursor={false}
                          contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px" }}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => [`${value} game${value !== 1 ? "s" : ""}`, ""]}
                          labelFormatter={(l) => `${label}: ${l}`}
                        />
                        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                          {histData.map((_, i) => (
                            <Cell key={i} fill={color} fillOpacity={0.7} />
                          ))}
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

      <h2 className="text-xl font-bold font-display uppercase tracking-wide mb-4">Recent Games</h2>
      {games.length === 0 ? (
        <p className="text-gray-500">No finished games yet.</p>
      ) : (
        <div className="space-y-2">
          {games.map((game) => (
            <div
              key={game.id}
              className="flex items-center gap-4 py-2 border-b border-gray-100 dark:border-gray-900"
            >
              <span
                className={`font-bold text-sm w-6 ${
                  game.result === "W" ? "text-green-400" : "text-red-400"
                }`}
              >
                {game.result}
              </span>
              <span className="flex-1 text-sm text-gray-500 dark:text-gray-400">
                {formatShortDateCT(game.start_time)}
              </span>
              <span className="tabular-nums font-medium">
                {Number(game.points_scored)} pts
              </span>
            </div>
          ))}
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
