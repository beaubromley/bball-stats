"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseTranscript, type ParsedCommand } from "@/lib/parser";

const API_BASE = "/api";

type TargetScore = 11 | 15 | 21;
type PlayerAssignment = "A" | "B" | null;

interface KnownPlayer {
  id: string;
  name: string;
}

// Hardcoded player list — eventually fetched from GroupMe active members
const DEFAULT_PLAYERS: KnownPlayer[] = [
  "Beau", "Joe", "Tyler", "Addison", "Brandon", "Brent", "Gage",
  "AJ", "Austin", "Jackson", "James", "Jacob", "Garett",
  "Jon", "Matt", "Ty", "JC",
].map((name) => ({ id: name, name }));

interface ScoringEvent {
  id: number;
  playerName: string;
  points: number;
  type: "score" | "correction" | "steal";
  transcript: string;
  time: number;
  assistBy?: string;
  stealBy?: string;
}

interface GameState {
  gameId: string | null;
  status: "idle" | "setup" | "active" | "finished";
  targetScore: TargetScore;
  teamA: string[];
  teamB: string[];
  teamAScore: number;
  teamBScore: number;
  events: ScoringEvent[];
  winningTeam: "A" | "B" | null;
}

const initial: GameState = {
  gameId: null,
  status: "idle",
  targetScore: 11,
  teamA: [],
  teamB: [],
  teamAScore: 0,
  teamBScore: 0,
  events: [],
  winningTeam: null,
};

function getTeam(state: GameState, name: string): "A" | "B" | null {
  const n = name.toLowerCase();
  if (state.teamA.some((p) => p.toLowerCase() === n) || n === "beau") return "A";
  if (state.teamB.some((p) => p.toLowerCase() === n)) return "B";
  return null;
}

function calcScores(events: ScoringEvent[], state: GameState) {
  let a = 0,
    b = 0;
  for (const e of events) {
    if (e.type === "correction") continue;
    const team = getTeam(state, e.playerName);
    if (team === "A") a += e.points;
    else if (team === "B") b += e.points;
  }
  return { teamAScore: a, teamBScore: b };
}

export default function RecordPage() {
  const [game, setGame] = useState<GameState>(initial);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const nextId = useRef(1);
  const watchUndoCountRef = useRef(0);

  // Known players from API
  const [knownPlayers, setKnownPlayers] = useState<KnownPlayer[]>(DEFAULT_PLAYERS);
  // Player assignments during setup: name -> "A" | "B" | null
  const [assignments, setAssignments] = useState<Record<string, PlayerAssignment>>({});
  // For adding new player names not in the list
  const [newPlayerName, setNewPlayerName] = useState("");

  // --- Web Speech API ---
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Web Speech API not supported in this browser");
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        setTranscript(finalText);
        setInterim("");
        handleVoiceResult(finalText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") {
        setError(event.error);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started, ignore
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
    setError("");
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      const ref = recognitionRef.current;
      recognitionRef.current = null;
      ref.stop();
    }
    setListening(false);
  }, []);

  // --- Wake Lock (keep screen on) ---
  useEffect(() => {
    if (listening && "wakeLock" in navigator) {
      navigator.wakeLock
        .request("screen")
        .then((lock) => {
          wakeLockRef.current = lock;
        })
        .catch(() => {});
    }
    return () => {
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [listening]);

  // --- Poll API for watch-initiated undos ---
  useEffect(() => {
    if (game.status !== "active" || !game.gameId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/games/${game.gameId}/events`);
        if (!res.ok) return;
        const apiEvents = await res.json();
        const watchUndos = apiEvents.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e: any) => e.event_type === "correction" && e.raw_transcript === "watch-undo"
        );
        if (watchUndos.length > watchUndoCountRef.current) {
          const newUndos = watchUndos.length - watchUndoCountRef.current;
          setGame((prev) => {
            let state = prev;
            for (let i = 0; i < newUndos; i++) {
              state = undoLast(state, "watch-undo");
            }
            return state;
          });
          watchUndoCountRef.current = watchUndos.length;
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [game.status, game.gameId]);

  // --- Notify API when game auto-ends (target score reached or voice "game over") ---
  const prevStatusRef = useRef(game.status);
  useEffect(() => {
    if (prevStatusRef.current !== "finished" && game.status === "finished" && game.gameId && game.winningTeam) {
      fetch(`${API_BASE}/games/${game.gameId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winning_team: game.winningTeam }),
      }).catch(() => {});
    }
    prevStatusRef.current = game.status;
  }, [game.status, game.gameId, game.winningTeam]);

  // --- Post events to API (outside state updater to avoid double-fire in strict mode) ---
  function postScoreToApi(gameId: string, cmd: ParsedCommand, raw: string) {
    fetch(`${API_BASE}/games/${gameId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_name: cmd.playerName,
        event_type: "score",
        point_value: cmd.points,
        raw_transcript: raw,
      }),
    }).catch(() => {});
    if (cmd.assistBy) {
      fetch(`${API_BASE}/games/${gameId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_name: cmd.assistBy,
          event_type: "assist",
          point_value: 0,
          raw_transcript: raw,
        }),
      }).catch(() => {});
    }
    if (cmd.stealBy) {
      fetch(`${API_BASE}/games/${gameId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_name: cmd.stealBy,
          event_type: "steal",
          point_value: 0,
          raw_transcript: raw,
        }),
      }).catch(() => {});
    }
  }

  function postStealToApi(gameId: string, playerName: string, raw: string) {
    fetch(`${API_BASE}/games/${gameId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_name: playerName,
        event_type: "steal",
        point_value: 0,
        raw_transcript: raw,
      }),
    }).catch(() => {});
  }

  // Alert state for unrecognized commands
  const [retryAlert, setRetryAlert] = useState<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showRetryAlert(msg: string) {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setRetryAlert(msg);
    retryTimerRef.current = setTimeout(() => setRetryAlert(null), 3000);
  }

  // Ref to access current game state outside state updater
  const gameRef = useRef<GameState>(game);
  gameRef.current = game;

  // --- Voice command handler ---
  const handleVoiceResult = useCallback((text: string) => {
    const currentGame = gameRef.current;

    // During setup, handle "set_teams" voice command
    if (currentGame.status === "setup") {
      const cmd = parseTranscript(text, []);
      if (cmd.type === "set_teams" && cmd.teams) {
        const newAssignments: Record<string, PlayerAssignment> = {};
        for (const name of cmd.teams.a) {
          newAssignments[name] = "A";
          setKnownPlayers((kp) => {
            if (kp.some((p) => p.name.toLowerCase() === name.toLowerCase())) return kp;
            return [...kp, { id: name, name }];
          });
        }
        for (const name of cmd.teams.b) {
          newAssignments[name] = "B";
          setKnownPlayers((kp) => {
            if (kp.some((p) => p.name.toLowerCase() === name.toLowerCase())) return kp;
            return [...kp, { id: name, name }];
          });
        }
        setAssignments(newAssignments);
      }
      return;
    }

    if (currentGame.status !== "active") return;

    const allPlayers = [...currentGame.teamA, ...currentGame.teamB];
    const cmd = parseTranscript(text, allPlayers);

    // Reject score/steal without a recognized player name
    if ((cmd.type === "score" || cmd.type === "steal") && !cmd.playerName) {
      showRetryAlert(`Didn't catch a name — say again`);
      return;
    }

    // Fire API calls ONCE, outside the state updater
    if (currentGame.gameId) {
      if (cmd.type === "score" && cmd.playerName && cmd.points) {
        postScoreToApi(currentGame.gameId, cmd, text);

        // Check if this score triggers auto-end
        const isTeamA = currentGame.teamA.some(
          (p) => p.toLowerCase() === cmd.playerName!.toLowerCase()
        );
        const newA = currentGame.teamAScore + (isTeamA ? cmd.points : 0);
        const newB = currentGame.teamBScore + (!isTeamA ? cmd.points : 0);
        if (newA >= currentGame.targetScore || newB >= currentGame.targetScore) {
          const winner = newA >= currentGame.targetScore ? "A" : "B";
          fetch(`${API_BASE}/games/${currentGame.gameId}/end`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ winning_team: winner }),
          }).catch(() => {});
        }
      } else if (cmd.type === "steal" && cmd.playerName) {
        postStealToApi(currentGame.gameId, cmd.playerName, text);
      }
    }

    // Pure state update
    setGame((prev) => {
      switch (cmd.type) {
        case "score":
          return addScore(prev, cmd, text);
        case "steal":
          return addSteal(prev, cmd, text);
        case "correction":
          return undoLast(prev, text);
        case "end_game":
          if (cmd.winningTeam)
            return { ...prev, status: "finished", winningTeam: cmd.winningTeam };
          return prev;
        default:
          return prev;
      }
    });
  }, []);

  function addScore(
    state: GameState,
    cmd: ParsedCommand,
    raw: string
  ): GameState {
    if (!cmd.playerName || !cmd.points) return state;
    const evt: ScoringEvent = {
      id: nextId.current++,
      playerName: cmd.playerName,
      points: cmd.points,
      type: "score",
      transcript: raw,
      time: Date.now(),
      assistBy: cmd.assistBy,
      stealBy: cmd.stealBy,
    };
    const events = [...state.events, evt];
    const newState = { ...state, events };
    const scores = calcScores(events, newState);

    let autoEnd: Partial<GameState> = {};
    if (scores.teamAScore >= state.targetScore)
      autoEnd = { status: "finished", winningTeam: "A" };
    else if (scores.teamBScore >= state.targetScore)
      autoEnd = { status: "finished", winningTeam: "B" };

    return { ...newState, ...scores, ...autoEnd };
  }

  function addSteal(
    state: GameState,
    cmd: ParsedCommand,
    raw: string
  ): GameState {
    if (!cmd.playerName) return state;
    const evt: ScoringEvent = {
      id: nextId.current++,
      playerName: cmd.playerName,
      points: 0,
      type: "steal",
      transcript: raw,
      time: Date.now(),
    };
    const events = [...state.events, evt];

    return { ...state, events };
  }

  function undoLast(state: GameState, raw: string): GameState {
    const lastScore = [...state.events]
      .reverse()
      .find((e) => e.type === "score");
    if (!lastScore) return state;
    const filtered = state.events.filter((e) => e.id !== lastScore.id);
    const correction: ScoringEvent = {
      id: nextId.current++,
      playerName: lastScore.playerName,
      points: -lastScore.points,
      type: "correction",
      transcript: raw,
      time: Date.now(),
    };
    const events = [...filtered, correction];
    const newState = { ...state, events };
    const scores = calcScores(
      events.filter((e) => e.type === "score"),
      newState
    );
    return { ...newState, ...scores };
  }

  // --- Manual score ---
  function manualScore(playerName: string, points: number) {
    handleVoiceResult(
      points === 2 ? `${playerName} two` : `${playerName} bucket`
    );
  }

  function manualUndo() {
    handleVoiceResult("undo");
  }

  // --- Player assignment (setup) ---
  function cyclePlayer(name: string) {
    setAssignments((prev) => {
      const current = prev[name] ?? null;
      const next: PlayerAssignment =
        current === null ? "A" : current === "A" ? "B" : null;
      return { ...prev, [name]: next };
    });
  }

  function addNewPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;
    if (knownPlayers.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setError("Player already in list");
      return;
    }
    setKnownPlayers((prev) => [...prev, { id: name, name }]);
    setAssignments((prev) => ({ ...prev, [name]: "A" }));
    setNewPlayerName("");
    setError("");
  }

  // --- Game lifecycle ---
  function startGame(target: TargetScore) {
    setAssignments({ Beau: "A" });
    setGame((prev) => ({ ...prev, status: "setup", targetScore: target }));
  }

  async function confirmTeams() {
    const teamA = Object.entries(assignments)
      .filter(([, team]) => team === "A")
      .map(([name]) => name);
    const teamB = Object.entries(assignments)
      .filter(([, team]) => team === "B")
      .map(([name]) => name);

    if (teamA.length === 0 || teamB.length === 0) {
      setError("Both teams need at least one player");
      return;
    }

    let gameId: string | null = null;
    try {
      const res = await fetch(`${API_BASE}/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: "Pickup" }),
      });
      const data = await res.json();
      gameId = data.id;

      await fetch(`${API_BASE}/games/${gameId}/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_a: teamA, team_b: teamB }),
      });
    } catch {
      setError("API unreachable — scores will only be tracked locally");
    }

    stopListening();
    setGame((prev) => ({
      ...prev,
      gameId,
      status: "active",
      teamA,
      teamB,
    }));
    setError("");
  }

  async function endGame(winner: "A" | "B") {
    stopListening();
    if (game.gameId) {
      fetch(`${API_BASE}/games/${game.gameId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winning_team: winner }),
      }).catch(() => {});
    }
    setGame((prev) => ({ ...prev, status: "finished", winningTeam: winner }));
  }

  async function saveGame() {
    setSaved("saving");
    try {
      let gameId = game.gameId;
      if (!gameId) {
        const res = await fetch(`${API_BASE}/games`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location: "Pickup" }),
        });
        const data = await res.json();
        gameId = data.id;

        await fetch(`${API_BASE}/games/${gameId}/roster`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_a: game.teamA, team_b: game.teamB }),
        });

        for (const evt of game.events.filter((e) => e.type === "score")) {
          await fetch(`${API_BASE}/games/${gameId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              player_name: evt.playerName,
              event_type: "score",
              point_value: evt.points,
              raw_transcript: evt.transcript,
            }),
          });
        }
      }

      await fetch(`${API_BASE}/games/${gameId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winning_team: game.winningTeam }),
      });

      setGame((prev) => ({ ...prev, gameId }));
      setSaved("saved");
    } catch {
      setSaved("error");
      setError("Failed to save game");
    }
  }

  async function deleteGame() {
    if (game.gameId) {
      try {
        await fetch(`${API_BASE}/games/${game.gameId}`, { method: "DELETE" });
      } catch {
        // ignore — just reset locally
      }
    }
    resetGame();
  }

  function resetGame() {
    stopListening();
    setGame(initial);
    setTranscript("");
    setInterim("");
    setAssignments({});
    watchUndoCountRef.current = 0;
    setNewPlayerName("");
    setSaved("idle");
    nextId.current = 1;
  }

  // Derived: team rosters from assignments
  const setupTeamA = Object.entries(assignments)
    .filter(([, team]) => team === "A")
    .map(([name]) => name);
  const setupTeamB = Object.entries(assignments)
    .filter(([, team]) => team === "B")
    .map(([name]) => name);

  // --- Render ---
  return (
    <div className="max-w-lg mx-auto">
      {/* Scoreboard */}
      <div className="flex items-center justify-between py-6">
        <div className="text-center flex-1">
          <div className="text-xs text-gray-500 tracking-wider">TEAM A</div>
          <div className="text-6xl font-bold tabular-nums">
            {game.teamAScore}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {game.teamA.join(", ") || setupTeamA.join(", ") || "—"}
          </div>
        </div>
        <div className="text-center px-4">
          <div className="text-gray-600 font-bold">VS</div>
          <div
            className={`text-xs font-bold mt-1 ${game.status === "active" ? "text-red-400" : "text-gray-600"}`}
          >
            {game.status === "active"
              ? "LIVE"
              : game.status === "finished"
                ? "FINAL"
                : ""}
          </div>
          {game.status === "active" && (
            <div className="text-xs text-gray-600 mt-0.5">
              to {game.targetScore}
            </div>
          )}
        </div>
        <div className="text-center flex-1">
          <div className="text-xs text-gray-500 tracking-wider">TEAM B</div>
          <div className="text-6xl font-bold tabular-nums">
            {game.teamBScore}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {game.teamB.join(", ") || setupTeamB.join(", ") || "—"}
          </div>
        </div>
      </div>

      {/* Listening indicator */}
      {(game.status === "active" || game.status === "setup") && (
        <div className="flex items-center justify-center gap-2 py-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${listening ? "bg-green-400 animate-pulse" : "bg-gray-600"}`}
          />
          <span className="text-sm text-gray-400">
            {listening ? "Listening..." : "Mic off"}
          </span>
        </div>
      )}

      {/* Transcript display */}
      {(transcript || interim) && (
        <div className="text-center text-sm text-gray-500 italic py-1">
          &ldquo;{interim || transcript}&rdquo;
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center text-sm text-red-400 py-1">{error}</div>
      )}

      {/* --- Idle: start game --- */}
      {game.status === "idle" && (
        <div className="space-y-3 py-6">
          <button
            onClick={() => startGame(11)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            New Game — to 11
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => startGame(15)}
              className="flex-1 py-2.5 border border-blue-600 text-blue-400 font-semibold rounded-lg hover:bg-blue-600/10 transition-colors"
            >
              To 15
            </button>
            <button
              onClick={() => startGame(21)}
              className="flex-1 py-2.5 border border-blue-600 text-blue-400 font-semibold rounded-lg hover:bg-blue-600/10 transition-colors"
            >
              To 21
            </button>
          </div>
        </div>
      )}

      {/* --- Setup: pick teams --- */}
      {game.status === "setup" && (
        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-400 text-center">
            Tap to assign: <span className="text-blue-400">Team A</span> →{" "}
            <span className="text-orange-400">Team B</span> → unassigned
          </p>

          {/* Player grid */}
          <div className="flex flex-wrap gap-2">
            {/* "Me" always first */}
            <button
              onClick={() => cyclePlayer("Beau")}
              className={`min-w-[5rem] px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                assignments["Beau"] === "A"
                  ? "bg-blue-600/20 border-blue-500 text-blue-300"
                  : assignments["Beau"] === "B"
                    ? "bg-orange-600/20 border-orange-500 text-orange-300"
                    : "bg-gray-900 border-gray-700 text-gray-400"
              }`}
            >
              Me
              {assignments["Beau"] === "A"
                ? " (A)"
                : assignments["Beau"] === "B"
                  ? " (B)"
                  : ""}
            </button>

            {knownPlayers
              .filter((p) => p.name !== "Beau")
              .map((player) => (
                <button
                  key={player.name}
                  onClick={() => cyclePlayer(player.name)}
                  className={`min-w-[5rem] px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    assignments[player.name] === "A"
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : assignments[player.name] === "B"
                        ? "bg-orange-600/20 border-orange-500 text-orange-300"
                        : "bg-gray-900 border-gray-700 text-gray-400"
                  }`}
                >
                  {player.name}
                  {assignments[player.name] === "A"
                    ? " (A)"
                    : assignments[player.name] === "B"
                      ? " (B)"
                      : ""}
                </button>
              ))}
          </div>

          {/* Add new player */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="Add new player..."
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
              onKeyDown={(e) => e.key === "Enter" && addNewPlayer()}
            />
            <button
              onClick={addNewPlayer}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Add
            </button>
          </div>

          {/* Voice input for teams */}
          <button
            onClick={listening ? stopListening : startListening}
            className={`w-full py-2.5 font-semibold rounded-lg transition-colors text-sm ${
              listening
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            {listening
              ? "Stop Mic"
              : 'Use Mic (say "teams: Me, John vs Mike, Gary")'}
          </button>

          {/* Team preview */}
          <div className="flex gap-4 text-sm">
            <div className="flex-1">
              <div className="text-blue-400 font-semibold mb-1">
                Team A ({setupTeamA.length})
              </div>
              <div className="text-gray-400">
                {setupTeamA.join(", ") || "—"}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-orange-400 font-semibold mb-1">
                Team B ({setupTeamB.length})
              </div>
              <div className="text-gray-400">
                {setupTeamB.join(", ") || "—"}
              </div>
            </div>
          </div>

          {/* Start game button */}
          <button
            onClick={confirmTeams}
            disabled={setupTeamA.length === 0 || setupTeamB.length === 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            Start Game (to {game.targetScore})
          </button>
        </div>
      )}

      {/* --- Retry alert --- */}
      {retryAlert && (
        <div className="mx-auto max-w-sm py-2 px-4 bg-red-900/80 border border-red-500 rounded-lg text-center text-red-200 text-sm font-semibold animate-pulse">
          {retryAlert}
        </div>
      )}

      {/* --- Active: controls --- */}
      {game.status === "active" && (
        <div className="space-y-3 py-4">
          <button
            onClick={listening ? stopListening : startListening}
            className={`w-full py-3 font-semibold rounded-lg transition-colors ${
              listening
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {listening ? "Stop Listening" : "Start Listening"}
          </button>

          {/* Manual buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => manualScore("Beau", 1)}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
            >
              +1
            </button>
            <button
              onClick={() => manualScore("Beau", 2)}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
            >
              +2
            </button>
            <button
              onClick={manualUndo}
              className="flex-1 py-2.5 bg-red-900/50 hover:bg-red-900 text-white font-semibold rounded-lg transition-colors"
            >
              Undo
            </button>
          </div>

          <button
            onClick={() => {
              const winner =
                game.teamAScore > game.teamBScore ? "A" : "B";
              if (confirm(`End game? Team ${winner} wins?`)) endGame(winner);
            }}
            className="w-full py-2.5 border border-gray-700 text-gray-400 font-semibold rounded-lg hover:bg-gray-900 transition-colors"
          >
            End Game
          </button>
        </div>
      )}

      {/* --- Finished --- */}
      {game.status === "finished" && (
        <div className="space-y-3 py-6 text-center">
          <div className="text-2xl font-bold text-yellow-400">
            Team {game.winningTeam} wins!
          </div>
          {saved !== "saved" && (
            <button
              onClick={saveGame}
              disabled={saved === "saving"}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:text-green-400 text-white font-semibold rounded-lg transition-colors"
            >
              {saved === "saving" ? "Saving..." : "Save Game"}
            </button>
          )}
          {saved === "saved" && (
            <div className="text-green-400 text-sm font-medium py-2">
              Game saved!
            </div>
          )}
          <button
            onClick={resetGame}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            New Game
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this game? This cannot be undone.")) deleteGame();
            }}
            className="w-full py-2.5 border border-red-800 text-red-400 font-semibold rounded-lg hover:bg-red-900/30 transition-colors text-sm"
          >
            Delete Game
          </button>
        </div>
      )}

      {/* Event log */}
      <div className="py-4">
        <h2 className="text-sm text-gray-500 mb-2">Event Log</h2>
        {game.events.length === 0 ? (
          <p className="text-sm text-gray-700 text-center py-8">
            {game.status === "active"
              ? 'Say "bucket" (+1) or "two" (+2), with a name for other players'
              : "Start a game to begin tracking"}
          </p>
        ) : (
          <div className="space-y-1">
            {[...game.events].reverse().map((evt) => (
              <div
                key={evt.id}
                className={`flex items-center gap-3 py-1.5 border-b border-gray-900 ${
                  evt.type === "correction" ? "opacity-40" : ""
                }`}
              >
                <div className="text-sm flex-1">
                  <span>{evt.playerName}</span>
                  {evt.stealBy && (
                    <span className="text-yellow-400 text-xs ml-1">
                      ({evt.stealBy} STL)
                    </span>
                  )}
                  {evt.assistBy && (
                    <span className="text-blue-400 text-xs ml-1">
                      ({evt.assistBy} AST)
                    </span>
                  )}
                </div>
                <span
                  className={`font-bold text-sm tabular-nums ${
                    evt.type === "correction"
                      ? "text-red-400"
                      : evt.type === "steal"
                        ? "text-yellow-400"
                        : "text-green-400"
                  }`}
                >
                  {evt.type === "correction"
                    ? "UNDO"
                    : evt.type === "steal"
                      ? "STL"
                      : `+${evt.points}`}
                </span>
                <span className="text-xs text-gray-600 w-12 text-right">
                  {new Date(evt.time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
