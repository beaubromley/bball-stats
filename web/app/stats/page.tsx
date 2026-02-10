"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
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
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
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

export default function StatsPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/players`)
      .then((res) => res.json())
      .then((data) => setPlayers(data))
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

  const fpData = [...players]
    .sort((a, b) => b.fantasy_points - a.fantasy_points)
    .map((p) => ({ name: p.name, FP: p.fantasy_points }));

  const winData = [...players]
    .filter((p) => p.games_played >= 1)
    .sort((a, b) => b.win_pct - a.win_pct)
    .map((p) => ({ name: p.name, "Win%": p.win_pct }));

  const ptsData = [...players]
    .sort((a, b) => b.total_points - a.total_points)
    .map((p) => ({ name: p.name, PTS: p.total_points }));

  const ppgData = [...players]
    .filter((p) => p.games_played >= 1)
    .sort((a, b) => b.ppg - a.ppg)
    .map((p) => ({ name: p.name, PPG: p.ppg }));

  const charts = [
    { title: "Fantasy Points Leaders", data: fpData, dataKey: "FP", color: "#3B82F6" },
    { title: "Win %", data: winData, dataKey: "Win%", color: "#F59E0B" },
    { title: "Total Points", data: ptsData, dataKey: "PTS", color: "#10B981" },
    { title: "Points Per Game", data: ppgData, dataKey: "PPG", color: "#8B5CF6" },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Stats</h1>

      <div className="space-y-10">
        {charts.map(({ title, data, dataKey, color }) => (
          <div key={title}>
            <h2 className="text-lg font-bold text-gray-300 mb-4">{title}</h2>
            <div className="border border-gray-800 rounded-lg p-4">
              <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
                <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
