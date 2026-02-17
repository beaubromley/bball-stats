"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";

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

interface RecentGame {
  id: string;
  start_time: string;
  result: string;
  points_scored: number;
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
    ])
      .then(([s, g]) => {
        setStats(s);
        setGames(g);
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
      date: new Date(g.start_time).toLocaleDateString(),
      pts: Number(g.points_scored),
    }));

  return (
    <div>
      <h1 className="text-3xl font-bold font-display tracking-wide mb-6">{stats.name}</h1>

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
            className="border border-gray-800 rounded-lg p-4 text-center"
          >
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className="text-2xl font-bold font-display tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="border border-gray-800 rounded-lg p-4 mb-8">
        <h2 className="text-sm text-gray-400 mb-3">Shooting</h2>
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
        <div className="border border-gray-800 rounded-lg p-4 mb-8">
          <h2 className="text-sm text-gray-400 mb-3">Scoring Trend</h2>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6B7280" }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="pts" stroke="#3B82F6" fill="rgba(59,130,246,0.2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <h2 className="text-xl font-bold font-display uppercase tracking-wide mb-4">Recent Games</h2>
      {games.length === 0 ? (
        <p className="text-gray-500">No finished games yet.</p>
      ) : (
        <div className="space-y-2">
          {games.map((game) => (
            <div
              key={game.id}
              className="flex items-center gap-4 py-2 border-b border-gray-900"
            >
              <span
                className={`font-bold text-sm w-6 ${
                  game.result === "W" ? "text-green-400" : "text-red-400"
                }`}
              >
                {game.result}
              </span>
              <span className="flex-1 text-sm text-gray-400">
                {new Date(game.start_time).toLocaleDateString()}
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
