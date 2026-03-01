"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
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
  LabelList,
  ScatterChart,
  Scatter,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
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
  mvp_count: number;
}

interface TodayData {
  games_today: number;
  players: PlayerRow[];
}

interface StreakData {
  gameLabels: { gameNum: number; date: string; label: string }[];
  players: { id: string; name: string; data: (number | null)[] }[];
  allTimeMaxWin: { value: number; player: string };
  allTimeMaxLoss: { value: number; player: string };
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm">
      <p className="text-gray-300 font-medium">{data.name}</p>
      <p className="text-green-400">FPG: {data.fpg}</p>
      <p className="text-yellow-400">Win%: {data.winPct}%</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface TabDef {
  label: string;
  data: any[];
  render: (data: any[]) => React.ReactNode;
}

function TabbedChart({ title, tabs, color }: { title: string; tabs: TabDef[]; color?: string }) {
  const [active, setActive] = useState(0);
  const data = tabs[active].data;
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-base font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300">{title}</h3>
        {tabs.length > 1 && (
          <div className="flex gap-1">
            {tabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActive(i)}
                className={`px-2.5 py-0.5 text-xs font-display uppercase tracking-wide rounded-full transition-colors ${
                  i === active
                    ? "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`border rounded-lg p-4 bg-white dark:bg-transparent ${color ? "" : "border-gray-200 dark:border-gray-800"}`}
        style={color ? { borderColor: `${color}30` } : undefined}
      >
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
          {tabs[active].render(data)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Home() {
  const { isAdmin, isViewer } = useAuth();
  const showAdvanced = isAdmin || isViewer;
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [todayStats, setTodayStats] = useState<TodayData | null>(null);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"season" | "all-time">("season");
  const [currentSeason, setCurrentSeason] = useState(1);
  const [totalSeasons, setTotalSeasons] = useState(1);
  const [gamesInSeason, setGamesInSeason] = useState(0);
  const [switching, setSwitching] = useState(false);

  function fetchLeaderboard(mode: "season" | "all-time", season?: number) {
    setSwitching(true);
    const seasonParam = mode === "season" && season ? `?season=${season}` : "";
    const streakParam = mode === "season" && season ? `?season=${season}` : "";
    Promise.all([
      fetch(`${API_BASE}/players${seasonParam}`).then((r) => r.json()),
      fetch(`${API_BASE}/stats/streaks${streakParam}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([leaderboardRes, streaks]) => {
        if (mode === "season") {
          setPlayers(leaderboardRes.data);
          setGamesInSeason(leaderboardRes.season.gamesInSeason);
        } else {
          setPlayers(leaderboardRes);
        }
        setStreakData(streaks);
      })
      .catch(() => {})
      .finally(() => setSwitching(false));
  }

  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    Promise.all([
      fetch(`${API_BASE}/stats/seasons`).then((r) => r.json()),
      fetch(`${API_BASE}/stats/today?date=${today}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([seasonInfo, todayData]) => {
        setCurrentSeason(seasonInfo.currentSeason);
        setTotalSeasons(seasonInfo.totalSeasons);
        setTodayStats(todayData);
        return Promise.all([
          fetch(`${API_BASE}/players?season=${seasonInfo.currentSeason}`).then((r) => r.json()),
          fetch(`${API_BASE}/stats/streaks?season=${seasonInfo.currentSeason}`).then((r) => r.json()).catch(() => null),
        ]);
      })
      .then(([leaderboardRes, streaks]) => {
        setPlayers(leaderboardRes.data);
        setGamesInSeason(leaderboardRes.season.gamesInSeason);
        setStreakData(streaks);
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
        <p className="text-lg">No games recorded yet.</p>
        <p className="text-sm mt-2">Start a game on the Record page to see stats here.</p>
      </div>
    );
  }

  // Chart data — per game versions filter to players with >= 1 game
  const activePlayers = players.filter((p) => p.games_played >= 1);
  const r1 = (n: number) => Math.round(n * 10) / 10;

  // Fantasy Points
  const fpData = [...players]
    .sort((a, b) => b.fantasy_points - a.fantasy_points)
    .map((p) => ({ name: p.name, PTS: p.total_points, AST: p.assists, STL: p.steals, BLK: p.blocks, total: p.fantasy_points }));
  const fpPerGameData = [...activePlayers]
    .sort((a, b) => b.fantasy_points / b.games_played - a.fantasy_points / a.games_played)
    .map((p) => {
      const gp = p.games_played;
      return { name: p.name, PTS: r1(p.total_points / gp), AST: r1(p.assists / gp), STL: r1(p.steals / gp), BLK: r1(p.blocks / gp), total: r1(p.fantasy_points / gp) };
    });

  // Points
  const ptsData = [...players]
    .sort((a, b) => b.total_points - a.total_points)
    .map((p) => ({ name: p.name, "1s": p.ones_made, "2s": p.twos_made * 2, total: p.total_points }));
  const ppgData = [...activePlayers]
    .sort((a, b) => b.ppg - a.ppg)
    .map((p) => {
      const gp = p.games_played;
      const ones = r1(p.ones_made / gp);
      const twos = r1(p.twos_made * 2 / gp);
      return { name: p.name, "1s": ones, "2s": twos, total: r1(ones + twos) };
    });

  // Win %
  const winData = [...activePlayers]
    .sort((a, b) => b.win_pct - a.win_pct)
    .map((p) => ({ name: p.name, "Win%": p.win_pct }));

  // MVPs
  const mvpData = [...players]
    .filter((p) => p.mvp_count > 0)
    .sort((a, b) => b.mvp_count - a.mvp_count)
    .map((p) => ({ name: p.name, MVPs: p.mvp_count }));

  // Assists
  const astData = [...players]
    .filter((p) => p.assists > 0)
    .sort((a, b) => b.assists - a.assists)
    .map((p) => ({ name: p.name, AST: p.assists }));
  const astPerGameData = [...activePlayers]
    .filter((p) => p.assists > 0)
    .sort((a, b) => b.assists / b.games_played - a.assists / a.games_played)
    .map((p) => ({ name: p.name, AST: r1(p.assists / p.games_played) }));

  // Steals
  const stlData = [...players]
    .filter((p) => p.steals > 0)
    .sort((a, b) => b.steals - a.steals)
    .map((p) => ({ name: p.name, STL: p.steals }));
  const stlPerGameData = [...activePlayers]
    .filter((p) => p.steals > 0)
    .sort((a, b) => b.steals / b.games_played - a.steals / a.games_played)
    .map((p) => ({ name: p.name, STL: r1(p.steals / p.games_played) }));

  // Blocks
  const blkData = [...players]
    .filter((p) => p.blocks > 0)
    .sort((a, b) => b.blocks - a.blocks)
    .map((p) => ({ name: p.name, BLK: p.blocks }));
  const blkPerGameData = [...activePlayers]
    .filter((p) => p.blocks > 0)
    .sort((a, b) => b.blocks / b.games_played - a.blocks / a.games_played)
    .map((p) => ({ name: p.name, BLK: r1(p.blocks / p.games_played) }));

  // Scatter
  const scatterData = [...activePlayers]
    .map((p) => ({ name: p.name, fpg: r1(p.fantasy_points / p.games_played), winPct: p.win_pct }));
  const SCATTER_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#A855F7", "#EC4899", "#06B6D4", "#F97316", "#84CC16", "#6366F1"];

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
                    <th className="py-2 pr-3 text-right">PPG</th>
                    <th className="py-2 pr-3 text-right">AST</th>
                    <th className="py-2 pr-3 text-right">STL</th>
                    <th className="py-2 pr-3 text-right">BLK</th>
                    <th className="py-2 pr-3 text-right">FP</th>
                    <th className="py-2 text-right">FPG</th>
                    {showAdvanced && <th className="py-2 pl-3 text-right">+/-</th>}
                  </tr>
                </thead>
                <tbody>
                  {todayStats.players.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 dark:border-gray-900">
                      <td className="py-2 pr-3">{p.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.games_played}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.wins}-{p.games_played - p.wins}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.total_points}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.games_played ? r1(p.total_points / p.games_played) : 0}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.assists}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.steals}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.blocks}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-bold text-blue-400">{p.fantasy_points}</td>
                      <td className="py-2 text-right tabular-nums font-bold text-blue-400">{p.games_played ? r1(p.fantasy_points / p.games_played) : 0}</td>
                      {showAdvanced && (
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

      {/* Season Toggle */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => { setViewMode("season"); fetchLeaderboard("season", currentSeason); }}
          className={`px-4 py-1.5 text-sm font-display uppercase tracking-wide rounded-full transition-colors ${
            viewMode === "season"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          Season {currentSeason}
        </button>
        <button
          onClick={() => { setViewMode("all-time"); fetchLeaderboard("all-time"); }}
          className={`px-4 py-1.5 text-sm font-display uppercase tracking-wide rounded-full transition-colors ${
            viewMode === "all-time"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          All-Time
        </button>
        {viewMode === "season" && (
          <span className="text-xs text-gray-500 ml-2">{gamesInSeason} / 82 games</span>
        )}
        {switching && <span className="text-xs text-gray-500 ml-2">Loading...</span>}
      </div>

      {/* Leaderboard Table */}
      <h2 className="text-lg font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4">
        {viewMode === "season" ? `Season ${currentSeason} Leaderboard` : "All-Time Leaderboard"}
      </h2>
      <div className="overflow-x-auto mb-10">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 text-sm">
              <th className="py-3 pr-4">#</th>
              <th className="py-3 pr-4">Player</th>
              <th className="py-3 pr-4 text-right">GP</th>
              <th className="py-3 pr-4 text-right">W-L</th>
              <th className="py-3 pr-4 text-right">Win%</th>
              <th className="py-3 pr-4 text-right">PTS</th>
              <th className="py-3 pr-4 text-right">PPG</th>
              <th className="py-3 pr-4 text-right">AST</th>
              <th className="py-3 pr-4 text-right">STL</th>
              <th className="py-3 pr-4 text-right">BLK</th>
              <th className="py-3 pr-4 text-right">FP</th>
              <th className="py-3 text-right">FPG</th>
              {showAdvanced && <th className="py-3 pl-4 text-right">+/-</th>}
              {showAdvanced && <th className="py-3 pl-4 text-right">+/-PG</th>}
              {showAdvanced && <th className="py-3 pl-4 text-right">STK</th>}
            </tr>
          </thead>
          <tbody>
            {players.map((player, i) => (
              <tr
                key={player.id}
                className="border-b border-gray-100 dark:border-gray-900 hover:bg-gray-100 dark:hover:bg-gray-900/50 transition-colors"
              >
                <td className="py-3 pr-4 text-gray-500">{i + 1}</td>
                <td className="py-3 pr-4">
                  <Link
                    href={`/player?id=${player.id}`}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {player.name}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">{player.games_played}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{player.wins}-{player.games_played - player.wins}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{player.win_pct}%</td>
                <td className="py-3 pr-4 text-right tabular-nums">{player.total_points}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{player.ppg}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{player.assists}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{player.steals}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{player.blocks}</td>
                <td className="py-3 pr-4 text-right tabular-nums font-bold text-blue-400">{player.fantasy_points}</td>
                <td className="py-3 text-right tabular-nums font-bold text-blue-400">{player.games_played ? r1(player.fantasy_points / player.games_played) : 0}</td>
                {showAdvanced && (
                  <td className={`py-3 pl-4 text-right tabular-nums font-bold ${player.plus_minus > 0 ? "text-green-400" : player.plus_minus < 0 ? "text-red-400" : "text-gray-500"}`}>
                    {player.plus_minus > 0 ? "+" : ""}{player.plus_minus}
                  </td>
                )}
                {showAdvanced && (
                  <td className={`py-3 pl-4 text-right tabular-nums ${player.plus_minus_per_game > 0 ? "text-green-400" : player.plus_minus_per_game < 0 ? "text-red-400" : "text-gray-500"}`}>
                    {player.plus_minus_per_game > 0 ? "+" : ""}{player.plus_minus_per_game}
                  </td>
                )}
                {showAdvanced && (
                  <td className={`py-3 pl-4 text-right tabular-nums font-bold ${player.streak.startsWith("W") ? "text-green-400" : player.streak.startsWith("L") ? "text-red-400" : "text-gray-500"}`}>
                    {player.streak}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Charts */}
      <h2 className="text-lg font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4">
        {viewMode === "season" ? `Season ${currentSeason}` : "All-Time"}
      </h2>

      {/* Fantasy Points */}
      <TabbedChart title="Fantasy Points" tabs={[
        { label: "Per Game", data: fpPerGameData, render: (data) => (
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar dataKey="PTS" stackId="fp" fill="#10B981" />
            <Bar dataKey="AST" stackId="fp" fill="#3B82F6" />
            <Bar dataKey="STL" stackId="fp" fill="#EAB308" />
            <Bar dataKey="BLK" stackId="fp" fill="#A855F7" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="total" position="right" fill="#9CA3AF" fontSize={11} />
            </Bar>
          </BarChart>
        )},
        { label: "Total", data: fpData, render: (data) => (
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar dataKey="PTS" stackId="fp" fill="#10B981" />
            <Bar dataKey="AST" stackId="fp" fill="#3B82F6" />
            <Bar dataKey="STL" stackId="fp" fill="#EAB308" />
            <Bar dataKey="BLK" stackId="fp" fill="#A855F7" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="total" position="right" fill="#9CA3AF" fontSize={11} />
            </Bar>
          </BarChart>
        )},
      ]} />

      {/* Points */}
      <TabbedChart title="Points" tabs={[
        { label: "Per Game", data: ppgData, render: (data) => (
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar dataKey="1s" stackId="pts" fill="#10B981" />
            <Bar dataKey="2s" stackId="pts" fill="#3B82F6" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="total" position="right" fill="#9CA3AF" fontSize={11} />
            </Bar>
          </BarChart>
        )},
        { label: "Total", data: ptsData, render: (data) => (
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar dataKey="1s" stackId="pts" fill="#10B981" />
            <Bar dataKey="2s" stackId="pts" fill="#3B82F6" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="total" position="right" fill="#9CA3AF" fontSize={11} />
            </Bar>
          </BarChart>
        )},
      ]} />

      {/* Win % */}
      <div className="mb-8">
        <h3 className="text-base font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">Win %</h3>
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
          <ResponsiveContainer width="100%" height={Math.max(200, winData.length * 36)}>
            <BarChart data={winData} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey="Win%" fill="#F59E0B" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="Win%" position="right" fill="#9CA3AF" fontSize={11} formatter={(v) => `${v}%`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MVP Awards */}
      {mvpData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-base font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">MVP Awards</h3>
          <div className="border border-yellow-300/30 dark:border-yellow-700/30 rounded-lg p-4 bg-yellow-50/50 dark:bg-yellow-900/5">
            <ResponsiveContainer width="100%" height={Math.max(200, mvpData.length * 36)}>
              <BarChart data={mvpData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <Bar dataKey="MVPs" fill="#EAB308" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="MVPs" position="right" fill="#EAB308" fontSize={11} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Assists */}
      {astData.length > 0 && (
        <TabbedChart title="Assists" color="#3B82F6" tabs={[
          { label: "Per Game", data: astPerGameData, render: (data) => (
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey="AST" fill="#3B82F6" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="AST" position="right" fill="#9CA3AF" fontSize={11} />
              </Bar>
            </BarChart>
          )},
          { label: "Total", data: astData, render: (data) => (
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey="AST" fill="#3B82F6" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="AST" position="right" fill="#9CA3AF" fontSize={11} />
              </Bar>
            </BarChart>
          )},
        ]} />
      )}

      {/* Steals */}
      {stlData.length > 0 && (
        <TabbedChart title="Steals" color="#EAB308" tabs={[
          { label: "Per Game", data: stlPerGameData, render: (data) => (
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey="STL" fill="#EAB308" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="STL" position="right" fill="#9CA3AF" fontSize={11} />
              </Bar>
            </BarChart>
          )},
          { label: "Total", data: stlData, render: (data) => (
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey="STL" fill="#EAB308" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="STL" position="right" fill="#9CA3AF" fontSize={11} />
              </Bar>
            </BarChart>
          )},
        ]} />
      )}

      {/* Blocks */}
      {blkData.length > 0 && (
        <TabbedChart title="Blocks" color="#A855F7" tabs={[
          { label: "Per Game", data: blkPerGameData, render: (data) => (
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey="BLK" fill="#A855F7" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="BLK" position="right" fill="#9CA3AF" fontSize={11} />
              </Bar>
            </BarChart>
          )},
          { label: "Total", data: blkData, render: (data) => (
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey="BLK" fill="#A855F7" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="BLK" position="right" fill="#9CA3AF" fontSize={11} />
              </Bar>
            </BarChart>
          )},
        ]} />
      )}

      {/* FPG vs Win% Scatter */}
      {scatterData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-base font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">Fantasy PPG vs Win %</h3>
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
            <ResponsiveContainer width="100%" height={350}>
              <ScatterChart margin={{ left: 10, right: 20, top: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis
                  type="number"
                  dataKey="fpg"
                  name="FPG"
                  tick={{ fontSize: 12, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "Fantasy Points Per Game", position: "insideBottom", offset: -5, fontSize: 12, fill: "#6B7280" }}
                />
                <YAxis
                  type="number"
                  dataKey="winPct"
                  name="Win%"
                  tick={{ fontSize: 12, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "Win %", angle: -90, position: "insideLeft", offset: 10, fontSize: 12, fill: "#6B7280" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={scatterData}>
                  {scatterData.map((_entry, index) => (
                    <Cell key={index} fill={SCATTER_COLORS[index % SCATTER_COLORS.length]} />
                  ))}
                  <LabelList dataKey="name" position="top" fill="#9CA3AF" fontSize={10} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Win Streak Chart (login required) */}
      {showAdvanced && streakData && streakData.players.length > 0 && (() => {
        const LINE_COLORS = [
          "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#A855F7",
          "#EC4899", "#06B6D4", "#F97316", "#84CC16", "#6366F1",
          "#14B8A6", "#E11D48", "#8B5CF6", "#D97706", "#059669",
          "#7C3AED", "#DC2626", "#2563EB", "#CA8A04", "#0891B2",
          "#DB2777", "#4F46E5",
        ];
        // Build chart data: one object per game with each player as a key
        const chartData = streakData.gameLabels.map((label, gi) => {
          const point: Record<string, string | number | null> = { game: label.label, gameNum: label.gameNum, date: label.date };
          for (const p of streakData.players) {
            point[p.name] = p.data[gi];
          }
          return point;
        });
        // Track which date indices should show the date label (first game of each date)
        const dateFirstIndex = new Set<number>();
        let prevDate = "";
        chartData.forEach((d, i) => {
          if (d.date !== prevDate) { dateFirstIndex.add(i); prevDate = d.date as string; }
        });

        return (
          <div className="mb-8">
            <h3 className="text-base font-bold font-display uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-3">Win Streaks (Last 10 Games)</h3>
            <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData} margin={{ left: 10, right: 10, top: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="gameNum"
                    axisLine={false}
                    tickLine={false}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    tick={(props: any) => {
                      const { x, y, index, payload } = props;
                      const showDate = dateFirstIndex.has(index);
                      const date = chartData[index]?.date as string;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} dy={12} textAnchor="middle" fill="#9CA3AF" fontSize={11}>#{payload.value}</text>
                          {showDate && <text x={0} y={0} dy={26} textAnchor="middle" fill="#6B7280" fontSize={10}>{date}</text>}
                        </g>
                      );
                    }}
                  />
                  <YAxis tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} domain={[streakData.allTimeMaxLoss.value - 2, streakData.allTimeMaxWin.value + 2]} />
                  <ReferenceLine y={0} stroke="#4B5563" strokeDasharray="3 3" />
                  {streakData.allTimeMaxWin.value > 0 && (
                    <>
                      <ReferenceLine y={streakData.allTimeMaxWin.value} stroke="#10B981" strokeDasharray="6 3" />
                      <ReferenceLine
                        y={streakData.allTimeMaxWin.value + 1}
                        stroke="transparent"
                        label={{ value: `Best: ${streakData.allTimeMaxWin.player} (W${streakData.allTimeMaxWin.value})`, position: "insideLeft", fill: "#10B981", fontSize: 11 }}
                      />
                    </>
                  )}
                  {streakData.allTimeMaxLoss.value < 0 && (
                    <>
                      <ReferenceLine y={streakData.allTimeMaxLoss.value} stroke="#EF4444" strokeDasharray="6 3" />
                      <ReferenceLine
                        y={streakData.allTimeMaxLoss.value - 1}
                        stroke="transparent"
                        label={{ value: `Worst: ${streakData.allTimeMaxLoss.player} (L${Math.abs(streakData.allTimeMaxLoss.value)})`, position: "insideLeft", fill: "#EF4444", fontSize: 11 }}
                      />
                    </>
                  )}
                  <Tooltip
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "#9CA3AF", fontWeight: "bold", marginBottom: "4px" }}
                    itemSorter={(item) => -(item.value as number ?? 0)}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
                  {streakData.players.map((p, i) => (
                    <Line
                      key={p.id}
                      type="monotone"
                      dataKey={p.name}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
