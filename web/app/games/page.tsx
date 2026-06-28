"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { groupBySeason, formatSeasonGameCompact } from "@/lib/seasons";
import { useAuth } from "@/app/components/AuthProvider";
import { useMe } from "@/app/components/MeContext";
import { formatShortDateCT } from "@/lib/time";

const API_BASE = "/api";

interface GameMvp {
  player_id: string;
  player_name: string;
  points: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
}

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
  mvp: GameMvp | null;
}

export default function GamesPage() {
  const { isAdmin } = useAuth();
  const { me } = useMe();
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [endingGame, setEndingGame] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [meOnly, setMeOnly] = useState(false);
  // Picked player's stat line per game. Used to show their box-score
  // row under the MVP. Populated only when a player is selected.
  const [meGameStats, setMeGameStats] = useState<Record<string, {
    points: number;
    assists: number;
    steals: number;
    blocks: number;
    fantasy_points: number;
    is_mvp: number;
  }>>({});

  function fetchGames() {
    fetch(`${API_BASE}/games`)
      .then((res) => res.json())
      .then((data) => {
        setGames(data);
        // Default to latest season on first load
        if (selectedSeason === null && data.length > 0) {
          const grouped = groupBySeason([...data].reverse());
          setSelectedSeason(grouped.length);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchGames();
  }, []);

  // Fetch the picked player's per-game stat lines whenever the
  // selection changes. Built into a game_id-keyed map so the games
  // list can show their box score under the MVP for each row.
  useEffect(() => {
    if (!me) {
      setMeGameStats({});
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/players/${me.id}/games`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; points_scored: number; assists: number; steals: number; blocks: number; fantasy_points: number; is_mvp: number }[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        const m: Record<string, {
          points: number;
          assists: number;
          steals: number;
          blocks: number;
          fantasy_points: number;
          is_mvp: number;
        }> = {};
        for (const r of rows) {
          m[r.id] = {
            points: Number(r.points_scored) || 0,
            assists: Number(r.assists) || 0,
            steals: Number(r.steals) || 0,
            blocks: Number(r.blocks) || 0,
            fantasy_points: Number(r.fantasy_points) || 0,
            is_mvp: Number(r.is_mvp) || 0,
          };
        }
        setMeGameStats(m);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [me?.id, me]);

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

  // Filter to "my games" if the toggle is on and a player is picked.
  // Roster lists are display names ("Beau B."), not ids — so we match
  // by name.
  const filteredGames = (me && meOnly)
    ? games.filter(
        (g) =>
          g.team_a_players.includes(me.name) ||
          g.team_b_players.includes(me.name),
      )
    : games;

  // Group filtered games by season. Season pills still reflect the
  // filtered slice so a season with no "me" games doesn't show.
  const seasonGroups = groupBySeason([...filteredGames].reverse());
  // If the saved selectedSeason isn't in the filtered slice (because
  // toggling "my games only" removed it), gracefully fall back to the
  // latest season that IS present instead of showing an empty list.
  const currentSeasonGames =
    seasonGroups.find((g) => g.season.number === selectedSeason) ??
    seasonGroups[seasonGroups.length - 1] ??
    null;

  return (
    <div>
      <h1 className="text-3xl font-bold font-display uppercase tracking-wide mb-6">Game History</h1>

      {games.length === 0 ? (
        <div className="text-gray-500 text-center py-16">
          <p className="text-lg">No games yet.</p>
        </div>
      ) : (
        <>
          {/* Season Filter Pills */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {seasonGroups.map(({ season }) => (
              <button
                key={season.number}
                onClick={() => setSelectedSeason(season.number)}
                className={`px-4 py-1.5 text-sm font-display uppercase tracking-wide rounded-full transition-colors ${
                  selectedSeason === season.number
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {season.label}
              </button>
            ))}
            {currentSeasonGames && (
              <span className="text-xs text-gray-500 ml-2">
                {currentSeasonGames.games.length} game{currentSeasonGames.games.length !== 1 ? "s" : ""}
              </span>
            )}
            {me && (
              <button
                onClick={() => setMeOnly((v) => !v)}
                className={`ml-auto px-3 py-1 text-xs font-display uppercase tracking-wider rounded transition-colors ${
                  meOnly
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700"
                }`}
                title={meOnly ? `Showing only games ${me.name} played in` : `Filter to games ${me.name} played in`}
              >
                {meOnly ? `Only ${me.name}` : "My games only"}
              </button>
            )}
          </div>

          {/* Games List for Selected Season */}
          {currentSeasonGames && (
            <div className="space-y-4">
              {[...currentSeasonGames.games].reverse().map((game) => (
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
                          {formatSeasonGameCompact(game.game_number)}
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

                  {/* MVP + box score (finished games only) */}
                  {game.mvp && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-900 flex items-baseline gap-3 flex-wrap">
                      <span className="text-[10px] font-bold font-display uppercase tracking-wider text-yellow-600 dark:text-yellow-500">
                        MVP
                      </span>
                      <Link
                        href={`/player?id=${game.mvp.player_id}`}
                        className="text-sm font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                      >
                        {game.mvp.player_name}
                      </Link>
                      <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                        <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.points}</span> PTS
                        <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
                        <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.assists}</span> AST
                        <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
                        <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.steals}</span> STL
                        <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
                        <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.blocks}</span> BLK
                        <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
                        <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.fantasy_points}</span> FP
                      </span>
                    </div>
                  )}

                  {/* "Your" box score — only when a player is picked,
                      they appeared in this game, and they weren't already
                      shown as MVP above. */}
                  {me && meGameStats[game.id] && !meGameStats[game.id].is_mvp && (
                    <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                      <span className="text-[10px] font-bold font-display uppercase tracking-wider text-blue-600 dark:text-blue-300">
                        You
                      </span>
                      <span className="text-sm font-bold font-display text-gray-900 dark:text-white">
                        {me.name}
                      </span>
                      <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                        <span className="font-bold text-gray-700 dark:text-gray-200">{meGameStats[game.id].points}</span> PTS
                        <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
                        <span className="font-bold text-gray-700 dark:text-gray-200">{meGameStats[game.id].assists}</span> AST
                        <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
                        <span className="font-bold text-gray-700 dark:text-gray-200">{meGameStats[game.id].steals}</span> STL
                        <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
                        <span className="font-bold text-gray-700 dark:text-gray-200">{meGameStats[game.id].blocks}</span> BLK
                        <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
                        <span className="font-bold text-gray-700 dark:text-gray-200">{meGameStats[game.id].fantasy_points}</span> FP
                      </span>
                    </div>
                  )}

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
          )}
        </>
      )}
    </div>
  );
}
