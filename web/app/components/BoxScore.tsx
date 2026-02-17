"use client";

import { useEffect, useState } from "react";
import MvpBanner from "./MvpBanner";

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

interface BoxScoreData {
  players: BoxScorePlayer[];
  mvp: BoxScorePlayer | null;
  winning_team: string | null;
  team_a_score: number;
  team_b_score: number;
}

export default function BoxScore({ gameId }: { gameId: string }) {
  const [data, setData] = useState<BoxScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/games/${gameId}/boxscore`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gameId]);

  if (loading) return <div className="text-gray-500 text-sm py-4">Loading box score...</div>;
  if (!data) return null;

  const teamA = data.players.filter((p) => p.team === "A");
  const teamB = data.players.filter((p) => p.team === "B");

  return (
    <div className="space-y-6">
      {data.mvp && (
        <MvpBanner
          playerName={data.mvp.player_name}
          fantasyPoints={data.mvp.fantasy_points}
          points={data.mvp.points}
          assists={data.mvp.assists}
          steals={data.mvp.steals}
          blocks={data.mvp.blocks}
        />
      )}

      {[
        { label: "Team A", players: teamA, score: data.team_a_score },
        { label: "Team B", players: teamB, score: data.team_b_score },
      ].map(({ label, players, score }) => (
        <div key={label}>
          <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {label} &mdash; {score} pts
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-500 text-xs font-display uppercase tracking-wider">
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3 text-right">PTS</th>
                  <th className="py-2 pr-3 text-right">1s</th>
                  <th className="py-2 pr-3 text-right">2s</th>
                  <th className="py-2 pr-3 text-right">AST</th>
                  <th className="py-2 pr-3 text-right">STL</th>
                  <th className="py-2 pr-3 text-right">BLK</th>
                  <th className="py-2 text-right">FP</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr
                    key={p.player_id}
                    className={`border-b border-gray-100 dark:border-gray-900 ${p.is_mvp ? "bg-yellow-50 dark:bg-yellow-900/20" : ""}`}
                  >
                    <td className="py-2 pr-3">
                      {p.player_name}
                      {p.is_mvp && (
                        <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400 font-bold">MVP</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.points}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.ones_made}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.twos_made}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.assists}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.steals}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.blocks}</td>
                    <td className="py-2 text-right tabular-nums font-bold text-blue-400">
                      {p.fantasy_points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
