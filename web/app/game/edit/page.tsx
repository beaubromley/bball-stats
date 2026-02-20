"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";

const API_BASE = "/api";

interface GameDetail {
  id: string;
  start_time: string;
  status: string;
  winning_team: string | null;
  team_a: string[];
  team_b: string[];
}

interface GameEvent {
  id: number;
  player_name: string;
  event_type: string;
  point_value: number;
  raw_transcript: string | null;
  created_at: string;
}

function EditInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add event form
  const [addPlayer, setAddPlayer] = useState("");
  const [addType, setAddType] = useState<"score" | "steal" | "block" | "assist">("score");
  const [addPoints, setAddPoints] = useState(1);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/login");
  }, [authLoading, isAdmin, router]);

  function fetchData() {
    if (!id || !isAdmin) return;
    Promise.all([
      fetch(`${API_BASE}/games/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/games/${id}/events`).then((r) => r.json()),
    ])
      .then(([g, e]) => { setGame(g); setEvents(e); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [id, isAdmin]);

  async function updatePlayerName(eventId: number, newName: string) {
    setSaving(true);
    await fetch(`${API_BASE}/games/${id}/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_name: newName }),
    });
    fetchData();
    setSaving(false);
  }

  async function updatePointValue(eventId: number, newPoints: number) {
    setSaving(true);
    await fetch(`${API_BASE}/games/${id}/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ point_value: newPoints }),
    });
    fetchData();
    setSaving(false);
  }

  async function deleteEventById(eventId: number) {
    setSaving(true);
    await fetch(`${API_BASE}/games/${id}/events/${eventId}`, { method: "DELETE" });
    fetchData();
    setSaving(false);
  }

  async function addEvent() {
    if (!addPlayer) return;
    setSaving(true);
    await fetch(`${API_BASE}/games/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_name: addPlayer,
        event_type: addType,
        point_value: addType === "score" ? addPoints : 0,
        raw_transcript: "manual-edit",
      }),
    });
    setAddPlayer("");
    fetchData();
    setSaving(false);
  }

  async function swapEvents(eventId: number, swapWithId: number) {
    setSaving(true);
    await fetch(`${API_BASE}/games/${id}/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ swap_with: swapWithId }),
    });
    fetchData();
    setSaving(false);
  }

  async function changeWinner(winner: "A" | "B") {
    setSaving(true);
    await fetch(`${API_BASE}/games/${id}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winning_team: winner }),
    });
    fetchData();
    setSaving(false);
  }

  if (authLoading || !isAdmin) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }
  if (loading) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }
  if (!game) {
    return <div className="text-gray-500 text-center py-16">Game not found.</div>;
  }

  const allPlayers = [...game.team_a, ...game.team_b];
  const scoreEvents = events.filter((e) => e.event_type === "score");
  const otherEvents = events.filter((e) => e.event_type !== "score" && e.event_type !== "correction");
  const corrections = events.filter((e) => e.event_type === "correction");

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link
          href={`/game?id=${id}`}
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          &larr; Back to Game
        </Link>
        {saving && <span className="text-xs text-yellow-500">Saving...</span>}
      </div>

      <h1 className="text-3xl font-bold font-display uppercase tracking-wide mb-2">Edit Game</h1>
      <p className="text-gray-500 text-sm mb-8">
        {new Date(game.start_time).toLocaleString()}
        {game.winning_team && <span className="ml-2">— Team {game.winning_team} wins</span>}
      </p>

      {/* Change winner */}
      <div className="mb-8 p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
        <h2 className="text-sm font-bold font-display uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Winning Team</h2>
        <div className="flex gap-3">
          <button
            onClick={() => changeWinner("A")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              game.winning_team === "A"
                ? "bg-blue-600 text-white"
                : "border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-500"
            }`}
          >
            Team A
          </button>
          <button
            onClick={() => changeWinner("B")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              game.winning_team === "B"
                ? "bg-orange-600 text-white"
                : "border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-orange-500"
            }`}
          >
            Team B
          </button>
        </div>
      </div>

      {/* Score events */}
      <div className="mb-8">
        <h2 className="text-sm font-bold font-display uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Scores</h2>
        <div className="space-y-2">
          {scoreEvents.map((evt, idx) => (
            <div key={evt.id} className="flex items-center gap-2 py-2 px-3 border border-gray-200 dark:border-gray-800 rounded-lg">
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => idx > 0 && swapEvents(evt.id, scoreEvents[idx - 1].id)}
                  disabled={idx === 0}
                  className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-20"
                  title="Move up"
                >&#9650;</button>
                <button
                  onClick={() => idx < scoreEvents.length - 1 && swapEvents(evt.id, scoreEvents[idx + 1].id)}
                  disabled={idx === scoreEvents.length - 1}
                  className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-20"
                  title="Move down"
                >&#9660;</button>
              </div>
              <select
                value={evt.player_name}
                onChange={(e) => updatePlayerName(evt.id, e.target.value)}
                className="flex-1 px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white"
              >
                {allPlayers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select
                value={evt.point_value}
                onChange={(e) => updatePointValue(evt.id, parseInt(e.target.value))}
                className="w-16 px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white text-center"
              >
                <option value={1}>+1</option>
                <option value={2}>+2</option>
                <option value={3}>+3</option>
              </select>
              <span className="text-xs text-gray-400 dark:text-gray-600 w-14 text-right">
                {new Date(evt.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button
                onClick={() => { if (confirm(`Delete ${evt.player_name} +${evt.point_value}?`)) deleteEventById(evt.id); }}
                className="text-red-400 hover:text-red-300 text-sm px-1"
                title="Delete"
              >
                &times;
              </button>
            </div>
          ))}
          {scoreEvents.length === 0 && (
            <p className="text-gray-500 text-sm py-2">No scores recorded.</p>
          )}
        </div>
      </div>

      {/* Other events (steals, blocks, assists) */}
      {otherEvents.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold font-display uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Steals / Blocks / Assists</h2>
          <div className="space-y-2">
            {otherEvents.map((evt) => (
              <div key={evt.id} className="flex items-center gap-2 py-2 px-3 border border-gray-200 dark:border-gray-800 rounded-lg">
                <select
                  value={evt.player_name}
                  onChange={(e) => updatePlayerName(evt.id, e.target.value)}
                  className="flex-1 px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white"
                >
                  {allPlayers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <span className={`text-xs font-bold w-10 text-center ${
                  evt.event_type === "steal" ? "text-yellow-400"
                    : evt.event_type === "block" ? "text-purple-400"
                    : "text-blue-400"
                }`}>
                  {evt.event_type === "steal" ? "STL" : evt.event_type === "block" ? "BLK" : "AST"}
                </span>
                <button
                  onClick={() => { if (confirm(`Delete ${evt.player_name} ${evt.event_type}?`)) deleteEventById(evt.id); }}
                  className="text-red-400 hover:text-red-300 text-sm px-1"
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Corrections */}
      {corrections.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold font-display uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Corrections</h2>
          <div className="space-y-2">
            {corrections.map((evt) => (
              <div key={evt.id} className="flex items-center gap-2 py-2 px-3 border border-gray-200 dark:border-gray-800 rounded-lg opacity-60">
                <span className="flex-1 text-sm">{evt.player_name}</span>
                <span className="text-xs text-red-400 font-bold">UNDO {evt.point_value}</span>
                <button
                  onClick={() => { if (confirm("Delete this correction?")) deleteEventById(evt.id); }}
                  className="text-red-400 hover:text-red-300 text-sm px-1"
                  title="Delete correction"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new event */}
      <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
        <h2 className="text-sm font-bold font-display uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Add Event</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={addPlayer}
            onChange={(e) => setAddPlayer(e.target.value)}
            className="flex-1 min-w-[120px] px-2 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white"
          >
            <option value="">Player...</option>
            {allPlayers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={addType}
            onChange={(e) => setAddType(e.target.value as "score" | "steal" | "block" | "assist")}
            className="w-24 px-2 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white"
          >
            <option value="score">Score</option>
            <option value="steal">Steal</option>
            <option value="block">Block</option>
            <option value="assist">Assist</option>
          </select>
          {addType === "score" && (
            <select
              value={addPoints}
              onChange={(e) => setAddPoints(parseInt(e.target.value))}
              className="w-16 px-2 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white text-center"
            >
              <option value={1}>+1</option>
              <option value={2}>+2</option>
              <option value={3}>+3</option>
            </select>
          )}
          <button
            onClick={addEvent}
            disabled={!addPlayer}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EditGamePage() {
  return (
    <Suspense fallback={<div className="text-gray-500 text-center py-16">Loading...</div>}>
      <EditInner />
    </Suspense>
  );
}
