"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { groupBySeason } from "@/lib/seasons";
import { useAuth } from "@/app/components/AuthProvider";
import { formatShortDateCT } from "@/lib/time";

const API_BASE = "/api";

interface GameRow {
  id: string;
  start_time: string;
  status: string;
  winning_team: string | null;
  team_a_players: string[];
  team_b_players: string[];
  team_a_score: number;
  team_b_score: number;
  game_number: number;
}

export default function GamesPage() {
  const { isAdmin } = useAuth();
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [endingGame, setEndingGame] = useState<string | null>(null);

  function fetchGames() {
    fetch(`${API_BASE}/games`)
      .then((res) => res.json())
      .then((data) => setGames(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchGames();
  }, []);

  async function handleDelete(gameId: string) {
    await fetch(`${API_BASE}/games/${gameId}`, { method: "DELETE" });
    setConfirmDelete(null);
    fetchGames();
  }

  async function handleEndGame(gameId: string, winner: "A" | "B") {
    await fetch(`${API_BASE}/games/${gameId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winning_team: winner }),
    });
    setEndingGame(null);
    fetchGames();
  }

  if (loading) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold font-display uppercase tracking-wide mb-6">Game History</h1>

      {games.length === 0 ? (
        <div className="text-gray-500 text-center py-16">
          <p className="text-lg">No games yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupBySeason([...games].reverse()).reverse().map(({ season, games: seasonGames }) => (
            <div key={season.number}>
              <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-3 border-b border-gray-200 dark:border-gray-800 pb-2">
                {season.label}
              </h2>
              <div className="space-y-4">
                {[...seasonGames].reverse().map((game) => (
                  <div
                    key={game.id}
                    className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
                  >
                    <Link
                      href={`/game?id=${game.id}`}
                      className="block"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-8">
                          <div className="text-center">
                            <div className="text-xs text-gray-500 mb-1">Team A</div>
                            <div className="text-2xl font-bold font-display tabular-nums">
                              {game.team_a_score}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {game.team_a_players.join(", ")}
                            </div>
                          </div>

                          <div className="text-gray-400 dark:text-gray-600 text-sm">vs</div>

                          <div className="text-center">
                            <div className="text-xs text-gray-500 mb-1">Team B</div>
                            <div className="text-2xl font-bold font-display tabular-nums">
                              {game.team_b_score}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {game.team_b_players.join(", ")}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-bold font-display text-gray-500 dark:text-gray-400">
                            Game {game.game_number}
                          </div>
                          <div
                            className={`text-xs font-medium ${
                              game.status === "active"
                                ? "text-red-400"
                                : "text-gray-500"
                            }`}
                          >
                            {game.status === "active" ? "LIVE" : "FINAL"}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                            {formatShortDateCT(game.start_time)}
                          </div>
                        </div>
                      </div>
                    </Link>

                    {/* Action buttons (admin only) */}
                    {isAdmin && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                      {/* End Game (only for active games) */}
                      {game.status === "active" && (
                        <>
                          {endingGame === game.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Winner:</span>
                              <button
                                onClick={() => handleEndGame(game.id, "A")}
                                className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white"
                              >
                                Team A
                              </button>
                              <button
                                onClick={() => handleEndGame(game.id, "B")}
                                className="px-3 py-1 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white"
                              >
                                Team B
                              </button>
                              <button
                                onClick={() => setEndingGame(null)}
                                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEndingGame(game.id)}
                              className="px-3 py-1 text-xs rounded border border-yellow-300 dark:border-yellow-700 text-yellow-600 dark:text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                            >
                              End Game
                            </button>
                          )}
                        </>
                      )}

                      {/* Delete */}
                      <div className="ml-auto">
                        {confirmDelete === game.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-400">Delete?</span>
                            <button
                              onClick={() => handleDelete(game.id)}
                              className="px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-500 text-white"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(game.id)}
                            className="px-3 py-1 text-xs rounded border border-red-900 text-red-500 hover:bg-red-900/30"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
