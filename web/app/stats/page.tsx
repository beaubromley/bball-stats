"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const API_BASE = "/api";

interface PlayerRow {
  id: string;
  name: string;
  games_played: number;
  wins: number;
  win_pct: number;
  total_points: number;
  ppg: number;
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  plus_minus: number;
  plus_minus_per_game: number;
  streak: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm">
      <p className="text-gray-300 font-medium">{label}</p>
      {payload.map((entry: { color: string; name: string; value: number }, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

interface TodayData {
  games_today: number;
  players: PlayerRow[];
}

export default function StatsPage() {
  const { isAdmin } = useAuth();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [todayStats, setTodayStats] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      fetch(`${API_BASE}/players`).then((r) => r.json()),
      fetch(`${API_BASE}/stats/today?date=${today}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([allPlayers, today]) => {
        setPlayers(allPlayers);
        setTodayStats(today);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  if (players.length === 0) {
    return (
      <div className="text-gray-500 text-center py-16">
        <p className="text-lg">No data yet.</p>
        <p className="text-sm mt-2">Play some games to see stats here.</p>
      </div>
    );
  }

  // Fantasy Points — stacked by source (PTS, AST, STL, BLK)
  const fpData = [...players]
    .sort((a, b) => b.fantasy_points - a.fantasy_points)
    .map((p) => ({ name: p.name, PTS: p.total_points, AST: p.assists, STL: p.steals, BLK: p.blocks }));

  const winData = [...players]
    .filter((p) => p.games_played >= 1)
    .sort((a, b) => b.win_pct - a.win_pct)
    .map((p) => ({ name: p.name, "Win%": p.win_pct }));

  // Total Points — stacked by 1s and 2s
  const ptsData = [...players]
    .sort((a, b) => b.total_points - a.total_points)
    .map((p) => ({ name: p.name, "1s": p.ones_made, "2s": p.twos_made * 2 }));

  // PPG — stacked by 1s and 2s per game
  const ppgData = [...players]
    .filter((p) => p.games_played >= 1)
    .sort((a, b) => b.ppg - a.ppg)
    .map((p) => {
      const gp = p.games_played || 1;
      return { name: p.name, "1s": Math.round((p.ones_made / gp) * 10) / 10, "2s": Math.round((p.twos_made * 2 / gp) * 10) / 10 };
    });

  return (
    <div>
      <h1 className="text-3xl font-bold font-display uppercase tracking-wide mb-8">Stats</h1>

      {/* Stats of the Day */}
      {todayStats && todayStats.games_today > 0 && (() => {
        const topScorer = todayStats.players[0];
        const topAssist = [...todayStats.players].sort((a, b) => b.assists - a.assists)[0];
        const fpLeader = [...todayStats.players].sort((a, b) => b.fantasy_points - a.fantasy_points)[0];
        return (
          <div className="mb-10">
            <h2 className="text-lg font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4">Stats of the Day</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 text-center">
                <div className="text-xs text-gray-500 font-display uppercase mb-1">Games</div>
                <div className="text-3xl font-bold font-display tabular-nums">{todayStats.games_today}</div>
              </div>
              {topScorer && (
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 text-center">
                  <div className="text-xs text-gray-500 font-display uppercase mb-1">Top Scorer</div>
                  <div className="text-lg font-bold font-display">{topScorer.name}</div>
                  <div className="text-sm text-green-400 tabular-nums">{topScorer.total_points} pts</div>
                </div>
              )}
              {topAssist && topAssist.assists > 0 && (
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 text-center">
                  <div className="text-xs text-gray-500 font-display uppercase mb-1">Most Assists</div>
                  <div className="text-lg font-bold font-display">{topAssist.name}</div>
                  <div className="text-sm text-blue-400 tabular-nums">{topAssist.assists} ast</div>
                </div>
              )}
              {fpLeader && (
                <div className="border border-yellow-300 dark:border-yellow-700/50 rounded-lg p-4 text-center bg-yellow-50 dark:bg-yellow-900/10">
                  <div className="text-xs text-yellow-600 dark:text-yellow-500 font-display uppercase mb-1">Fantasy MVP</div>
                  <div className="text-lg font-bold font-display text-yellow-400">{fpLeader.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">{fpLeader.fantasy_points} FP</div>
                </div>
              )}
            </div>

            {/* Today's mini leaderboard */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-500 text-xs font-display uppercase tracking-wider">
                    <th className="py-2 pr-3">Player</th>
                    <th className="py-2 pr-3 text-right">GP</th>
                    <th className="py-2 pr-3 text-right">W-L</th>
                    <th className="py-2 pr-3 text-right">PTS</th>
                    <th className="py-2 pr-3 text-right">AST</th>
                    <th className="py-2 pr-3 text-right">STL</th>
                    <th className="py-2 pr-3 text-right">BLK</th>
                    <th className="py-2 text-right">FP</th>
                    {isAdmin && <th className="py-2 pl-3 text-right">+/-</th>}
                  </tr>
                </thead>
                <tbody>
                  {todayStats.players.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 dark:border-gray-900">
                      <td className="py-2 pr-3">{p.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.games_played}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.wins}-{p.games_played - p.wins}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.total_points}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.assists}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.steals}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.blocks}</td>
                      <td className="py-2 text-right tabular-nums font-bold text-blue-400">{p.fantasy_points}</td>
                      {isAdmin && (
                        <td className={`py-2 pl-3 text-right tabular-nums font-bold ${p.plus_minus > 0 ? "text-green-400" : p.plus_minus < 0 ? "text-red-400" : "text-gray-500"}`}>
                          {p.plus_minus > 0 ? "+" : ""}{p.plus_minus}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {todayStats && todayStats.games_today === 0 && (
        <div className="mb-8 text-center text-gray-400 dark:text-gray-600 text-sm py-4 border border-gray-200 dark:border-gray-800/50 rounded-lg">
          No games played today
        </div>
      )}

      {/* All-Time Stats */}
      <h2 className="text-lg font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4">All-Time</h2>
      <div className="space-y-10">
        {/* Fantasy Points — stacked by source */}
        <div>
          <h2 className="text-lg font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4">Fantasy Points Leaders</h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
            <ResponsiveContainer width="100%" height={Math.max(200, fpData.length * 40)}>
              <BarChart data={fpData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="PTS" stackId="fp" fill="#10B981" />
                <Bar dataKey="AST" stackId="fp" fill="#3B82F6" />
                <Bar dataKey="STL" stackId="fp" fill="#EAB308" />
                <Bar dataKey="BLK" stackId="fp" fill="#A855F7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Win % */}
        <div>
          <h2 className="text-lg font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4">Win %</h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
            <ResponsiveContainer width="100%" height={Math.max(200, winData.length * 40)}>
              <BarChart data={winData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <Bar dataKey="Win%" fill="#F59E0B" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Total Points — stacked 1s and 2s */}
        <div>
          <h2 className="text-lg font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4">Total Points</h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
            <ResponsiveContainer width="100%" height={Math.max(200, ptsData.length * 40)}>
              <BarChart data={ptsData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="1s" stackId="pts" fill="#10B981" />
                <Bar dataKey="2s" stackId="pts" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PPG — stacked 1s and 2s */}
        <div>
          <h2 className="text-lg font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4">Points Per Game</h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
            <ResponsiveContainer width="100%" height={Math.max(200, ppgData.length * 40)}>
              <BarChart data={ppgData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="1s" stackId="ppg" fill="#10B981" />
                <Bar dataKey="2s" stackId="ppg" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
