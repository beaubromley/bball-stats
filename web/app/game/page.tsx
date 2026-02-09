"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
  created_at: string;
}

function GameDetailInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [game, setGame] = useState<GameDetail | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetch(`${API_BASE}/games/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/games/${id}/events`).then((r) => r.json()),
    ])
      .then(([g, e]) => {
        setGame(g);
        setEvents(e);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  if (!game) {
    return (
      <div className="text-gray-500 text-center py-16">Game not found.</div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Game Detail</h1>
      <p className="text-gray-500 text-sm mb-6">
        {new Date(game.start_time).toLocaleString()}
        {game.status === "finished" && (
          <span className="ml-2 text-gray-400">
            — Team {game.winning_team} wins
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm text-gray-400 mb-2">Team A</h3>
          <ul className="space-y-1">
            {game.team_a.map((name) => (
              <li key={name} className="text-sm">
                {name}
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm text-gray-400 mb-2">Team B</h3>
          <ul className="space-y-1">
            {game.team_b.map((name) => (
              <li key={name} className="text-sm">
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4">Play-by-Play</h2>
      {events.length === 0 ? (
        <p className="text-gray-500">No events recorded.</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const isCorrection = event.event_type === "correction";
            return (
              <div
                key={event.id}
                className={`flex items-center gap-4 py-2 border-b border-gray-900 ${
                  isCorrection ? "opacity-50" : ""
                }`}
              >
                <span className="text-sm text-gray-500 w-16">
                  {new Date(event.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="flex-1">{event.player_name}</span>
                <span
                  className={`font-bold tabular-nums ${
                    isCorrection ? "text-red-400" : "text-green-400"
                  }`}
                >
                  {isCorrection ? "UNDO" : `+${event.point_value}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GameDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="text-gray-500 text-center py-16">Loading...</div>
      }
    >
      <GameDetailInner />
    </Suspense>
  );
}
