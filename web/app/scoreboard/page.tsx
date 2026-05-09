"use client";

// Public, read-only big-numbers scoreboard for spectators. Drop this URL on a
// tablet propped against the gym wall and it auto-refreshes every 2 seconds.
// Shows whatever game is currently active (or the most-recently-finished game
// if no active one exists).
//
// No auth gate — this is just data anyone in the gym would already see.

import { useEffect, useRef, useState } from "react";

const API_BASE = "/api";

interface ScoreboardData {
  game_id: string | null;
  game_status: "active" | "finished" | "idle";
  team_a_score: number;
  team_b_score: number;
  team_a_names: string[];
  team_b_names: string[];
  target_score: number | null;
  last_event: string;
  last_event_player: string | null;
  last_event_points: number | null;
}

export default function ScoreboardPage() {
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastEventRef = useRef<string>("");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/games/active`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next: ScoreboardData = await res.json();
        if (cancelled) return;

        // Flash the screen briefly when a new play comes in. Keyed off the
        // last-event string changing to anything different from before.
        const eventKey = `${next.last_event_player ?? ""}|${next.last_event_points ?? ""}|${next.team_a_score}-${next.team_b_score}`;
        if (lastEventRef.current && lastEventRef.current !== eventKey) {
          setFlash(true);
          setTimeout(() => setFlash(false), 600);
        }
        lastEventRef.current = eventKey;

        setData(next);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) timer = setTimeout(tick, 2000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // We position fixed/inset-0 so the scoreboard fills the full viewport,
  // overlaying the app's nav and main-content padding from the root layout.
  // That way you can drop this URL on a TV/tablet and get a clean board.
  if (!data) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-gray-500 text-2xl">
        {error ? `Error: ${error}` : "Loading..."}
      </div>
    );
  }

  if (data.game_status === "idle" || data.game_id === null) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-gray-400 gap-4">
        <div className="text-3xl font-display uppercase tracking-widest">No game</div>
        <div className="text-sm">Waiting for a game to start...</div>
      </div>
    );
  }

  const aWin =
    data.game_status === "finished" && data.team_a_score > data.team_b_score;
  const bWin =
    data.game_status === "finished" && data.team_b_score > data.team_a_score;

  return (
    <div
      className={`fixed inset-0 z-[100] bg-black text-white flex flex-col transition-colors duration-300 ${
        flash ? "bg-emerald-900/30" : ""
      }`}
    >
      {/* Header strip */}
      <div className="flex items-center justify-between px-6 pt-4 text-xs font-display uppercase tracking-widest text-gray-500">
        <span>
          {data.game_status === "active" ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          ) : (
            "Final"
          )}
        </span>
        {data.target_score !== null && (
          <span>To {data.target_score}</span>
        )}
      </div>

      {/* The scoreboard. Hero-sized so it reads from across the gym. */}
      <div className="flex-1 grid grid-cols-3 items-center px-6">
        {/* Team A */}
        <div className="flex flex-col items-center">
          <div
            className={`text-xs font-display uppercase tracking-widest mb-2 ${
              aWin ? "text-yellow-400" : "text-blue-400"
            }`}
          >
            Team A {aWin && <span className="ml-1">— Winner</span>}
          </div>
          <div className="text-[18vw] font-bold font-display tabular-nums leading-none text-blue-400">
            {data.team_a_score}
          </div>
        </div>

        {/* Center divider */}
        <div className="flex flex-col items-center text-gray-600 text-[8vw] font-bold font-display">
          –
        </div>

        {/* Team B */}
        <div className="flex flex-col items-center">
          <div
            className={`text-xs font-display uppercase tracking-widest mb-2 ${
              bWin ? "text-yellow-400" : "text-orange-400"
            }`}
          >
            Team B {bWin && <span className="ml-1">— Winner</span>}
          </div>
          <div className="text-[18vw] font-bold font-display tabular-nums leading-none text-orange-400">
            {data.team_b_score}
          </div>
        </div>
      </div>

      {/* Last play */}
      <div className="px-6 pb-6 text-center min-h-[3rem]">
        {data.last_event_player && (
          <div className="text-2xl font-display">
            <span className="text-gray-400 text-base mr-2 uppercase tracking-wider">
              Last:
            </span>
            <span className="text-white font-bold">{data.last_event_player}</span>
            {data.last_event_points !== null && data.last_event_points !== 0 && (
              <span className="text-emerald-400 font-bold ml-2">
                +{data.last_event_points}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Rosters */}
      <div className="grid grid-cols-2 gap-2 px-6 pb-4 text-xs text-gray-500 border-t border-gray-900 pt-3">
        <div className="text-center">
          <div className="text-blue-400 font-display uppercase tracking-wider mb-1">
            Team A
          </div>
          <div>{data.team_a_names.join(" · ")}</div>
        </div>
        <div className="text-center">
          <div className="text-orange-400 font-display uppercase tracking-wider mb-1">
            Team B
          </div>
          <div>{data.team_b_names.join(" · ")}</div>
        </div>
      </div>
    </div>
  );
}
