"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

export default function Home() {
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

  return (
    <div>
      <h1 className="text-3xl font-bold font-display uppercase tracking-wide mb-6">Leaderboard</h1>

      {players.length === 0 ? (
        <div className="text-gray-500 text-center py-16">
          <p className="text-lg">No games recorded yet.</p>
          <p className="text-sm mt-2">
            Start a game on the Record page to see stats here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-sm">
                <th className="py-3 pr-4">#</th>
                <th className="py-3 pr-4">Player</th>
                <th className="py-3 pr-4 text-right">GP</th>
                <th className="py-3 pr-4 text-right">W</th>
                <th className="py-3 pr-4 text-right">Win%</th>
                <th className="py-3 pr-4 text-right">PTS</th>
                <th className="py-3 pr-4 text-right">PPG</th>
                <th className="py-3 pr-4 text-right">AST</th>
                <th className="py-3 pr-4 text-right">STL</th>
                <th className="py-3 pr-4 text-right">BLK</th>
                <th className="py-3 text-right">FP</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, i) => (
                <tr
                  key={player.id}
                  className="border-b border-gray-900 hover:bg-gray-900/50 transition-colors"
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
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {player.games_played}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {player.wins}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {player.win_pct}%
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {player.total_points}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {player.ppg}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {player.assists}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {player.steals}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {player.blocks}
                  </td>
                  <td className="py-3 text-right tabular-nums font-bold text-blue-400">
                    {player.fantasy_points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
