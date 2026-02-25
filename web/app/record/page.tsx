"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseTranscript, type ParsedCommand, type ScoringMode } from "@/lib/parser";
import { loadSherpaEngine, downsampleBuffer, buildHotwords, type SherpaEngine } from "@/lib/sherpa";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import BoxScore from "@/app/components/BoxScore";
import { useAuth } from "@/app/components/AuthProvider";

const API_BASE = "/api";

type TargetScore = number;
type PlayerAssignment = "A" | "B" | null;

interface KnownPlayer {
  id: string;
  name: string;        // displayName (e.g., "Beau B.")
  voiceName: string;   // what voice recognition matches (e.g., "beau")
  fullName?: string;   // original full name from GroupMe
  aliases?: string[];  // voice recognition aliases (e.g., ["gauge", "gates"])
}

// Players not in GroupMe who should always appear
const EXTRA_PLAYERS: KnownPlayer[] = [
  { id: "Ed G.", name: "Ed G.", voiceName: "ed", fullName: "Ed G." },
];

// Fallback player list if GroupMe API is unavailable
const DEFAULT_PLAYERS: KnownPlayer[] = [
  "Beau", "Joe", "Tyler", "Addison", "Brandon", "Brent", "Gage",
  "AJ", "Austin", "Jackson", "James", "Jacob", "Garett",
  "Jon", "Matt", "Ty", "JC", "Taylor", "Mack", "Josh",
  "Bryson", "Ryan", "David", "Parker", "Grant", "Colton",
].map((name) => ({ id: name, name, voiceName: name.toLowerCase() }));

interface ScoringEvent {
  id: number;
  apiId?: number;
  playerName: string;
  points: number;
  type: "score" | "correction" | "steal" | "block";
  transcript: string;
  time: number;
  assistBy?: string;
  stealBy?: string;
  team?: "A" | "B" | null;
  undone?: boolean;
}

interface GameState {
  gameId: string | null;
  status: "idle" | "setup" | "active" | "finished";
  targetScore: TargetScore;
  scoringMode: ScoringMode;
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
  scoringMode: "1s2s",
  teamA: [],
  teamB: [],
  teamAScore: 0,
  teamBScore: 0,
  events: [],
  winningTeam: null,
};

function getTeam(state: GameState, name: string): "A" | "B" | null {
  const n = name.toLowerCase();
  if (state.teamA.some((p) => p.toLowerCase() === n)) return "A";
  if (state.teamB.some((p) => p.toLowerCase() === n)) return "B";
  return null;
}

function calcScores(events: ScoringEvent[], state: GameState) {
  let a = 0,
    b = 0;
  for (const e of events) {
    if (e.type === "correction" || e.undone) continue;
    const team = e.team ?? getTeam(state, e.playerName);
    if (team === "A") a += e.points;
    else if (team === "B") b += e.points;
  }
  return { teamAScore: a, teamBScore: b };
}

export default function RecordPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace("/login");
    }
  }, [authLoading, isAdmin, router]);

  const [game, setGame] = useState<GameState>(initial);
  // Active game resume
  const [activeGameData, setActiveGameData] = useState<{
    game_id: string;
    team_a_names: string[];
    team_b_names: string[];
    team_a_score: number;
    team_b_score: number;
    target_score: number | null;
  } | null>(null);

  useEffect(() => {
    if (!isAdmin || game.status !== "idle") return;
    fetch(`${API_BASE}/games/active`)
      .then((r) => r.json())
      .then((data) => {
        if (data.game_id && data.game_status === "active") {
          setActiveGameData(data);
        }
      })
      .catch(() => {});
  }, [isAdmin, game.status]);

  async function resumeGame() {
    if (!activeGameData) return;
    const { game_id, team_a_names, team_b_names, team_a_score, team_b_score, target_score } = activeGameData;
    // Fetch events to rebuild local event log
    let events: ScoringEvent[] = [];
    try {
      const res = await fetch(`${API_BASE}/games/${game_id}/events`);
      const apiEvents = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events = apiEvents.filter((e: any) => e.event_type !== "correction").map((e: any, i: number) => ({
        id: i + 1,
        apiId: e.id,
        playerName: e.player_name,
        points: e.point_value,
        type: e.event_type as "score" | "steal" | "block",
        transcript: e.raw_transcript || "",
        time: new Date(e.created_at).getTime(),
        team: team_a_names.some((n: string) => n.toLowerCase() === e.player_name.toLowerCase()) ? "A" as const : "B" as const,
      }));
      nextId.current = events.length + 1;
    } catch { /* continue without events */ }

    setGame({
      gameId: game_id,
      status: "active",
      targetScore: target_score || 11,
      scoringMode: "1s2s",
      teamA: team_a_names,
      teamB: team_b_names,
      teamAScore: team_a_score,
      teamBScore: team_b_score,
      events,
      winningTeam: null,
    });
    setActiveGameData(null);
  }

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Audio input device selection
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  // Speech engine selection
  const [speechEngine, setSpeechEngine] = useState<"browser" | "deepgram" | "sherpa">("deepgram");
  // Trigger word mode — require "STAT" prefix before each command
  const [triggerWord, setTriggerWord] = useState(false);
  const triggerWordRef = useRef(false);
  triggerWordRef.current = triggerWord;
  // Sherpa-ONNX refs
  const sherpaEngineRef = useRef<SherpaEngine | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sherpaStreamRef = useRef<any>(null);
  const sherpaAudioCtxRef = useRef<AudioContext | null>(null);
  const sherpaProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const [sherpaStatus, setSherpaStatus] = useState<"not-loaded" | "loading" | "ready" | "error">("not-loaded");
  // Deepgram mode — uses Nova-3 "keyterm" param (not legacy "keywords")
  const deepgramWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const dgAccumulatorRef = useRef("");
  const dgReconnectCount = useRef(0);
  // Parse-on-recognition: last scored event ref for bolt-on assists
  const lastScoredEventRef = useRef<{ id: number; time: number } | null>(null);
  // Name carry-forward: buffer a bare player name for the next segment
  const pendingNameRef = useRef<{ name: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  // Dual display: last accepted command text (green line)
  const [acceptedCmd, setAcceptedCmd] = useState("");
  const acceptedCmdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Green flash on new play
  const [flashGreen, setFlashGreen] = useState(false);
  // Fullscreen scoreboard modal
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const addDebugLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setDebugLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);
  const showAcceptedCmd = useCallback((msg: string) => {
    if (acceptedCmdTimerRef.current) clearTimeout(acceptedCmdTimerRef.current);
    setAcceptedCmd(msg);
    acceptedCmdTimerRef.current = setTimeout(() => setAcceptedCmd(""), 3000);
    // Single green flash
    setFlashGreen(true);
    setTimeout(() => setFlashGreen(false), 1000);
  }, []);
  const nextId = useRef(1);
  const watchUndoCountRef = useRef(0);
  // Remember last game's teams for "Run it back" (persisted in localStorage)
  const [lastGameTeams, setLastGameTeams] = useState<{ teamA: string[]; teamB: string[]; winningTeam: "A" | "B" | null } | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lastGameTeams");
      if (saved) setLastGameTeams(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  // Auto-clear stale interim text after 5 seconds of no updates
  const interimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
    if (interim) {
      interimTimerRef.current = setTimeout(() => setInterim(""), 5000);
    }
    return () => { if (interimTimerRef.current) clearTimeout(interimTimerRef.current); };
  }, [interim]);

  // Push interim text to API for Garmin watch display (debounced 1s)
  const liveTranscriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedTranscript = useRef<string>("");
  useEffect(() => {
    if (liveTranscriptTimerRef.current) clearTimeout(liveTranscriptTimerRef.current);
    const gid = gameRef.current.gameId;
    if (!gid || gameRef.current.status !== "active") return;
    const text = interim || transcript || "";
    if (text === lastPushedTranscript.current) return;
    liveTranscriptTimerRef.current = setTimeout(() => {
      lastPushedTranscript.current = text;
      fetch(`${API_BASE}/games/${gid}/live-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    }, 1000);
    return () => { if (liveTranscriptTimerRef.current) clearTimeout(liveTranscriptTimerRef.current); };
  }, [interim, transcript]);

  // Player Registry: Two-tier system
  const [expectedPlayers, setExpectedPlayers] = useState<KnownPlayer[]>([]);
  const [fullPlayerList, setFullPlayerList] = useState<KnownPlayer[]>([]);
  const [playersSource, setPlayersSource] = useState<"loading" | "registry" | "fallback">("loading");

  // Search functionality for full player list
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Manual add player form
  const [newPlayerFirst, setNewPlayerFirst] = useState("");
  const [newPlayerLast, setNewPlayerLast] = useState("");

  // Player assignments during setup: name -> "A" | "B" | null
  const [assignments, setAssignments] = useState<Record<string, PlayerAssignment>>({});

  // Enumerate audio input devices
  const refreshDevices = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      setAudioDevices(inputs);
    } catch {
      // No mic permission
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, []);

  // Fetch players from registry on mount
  useEffect(() => {
    // Fetch expected to play list
    fetch(`${API_BASE}/players?status=active&expected=true`)
      .then((res) => res.json())
      .then((data) => {
        const players = data.players.map((p: any) => ({
          id: p.id,
          name: p.display_name,
          voiceName: p.first_name?.toLowerCase() || p.display_name.split(" ")[0].toLowerCase(),
          fullName: p.full_name,
          aliases: p.aliases || [],
        }));
        setExpectedPlayers(players);
        setPlayersSource("registry");
      })
      .catch((err) => {
        console.error("Failed to fetch expected players:", err);
        setPlayersSource("fallback");
      });

    // Fetch full player list for search
    fetch(`${API_BASE}/players?status=active`)
      .then((res) => res.json())
      .then((data) => {
        const players = data.players.map((p: any) => ({
          id: p.id,
          name: p.display_name,
          voiceName: p.first_name?.toLowerCase() || p.display_name.split(" ")[0].toLowerCase(),
          fullName: p.full_name,
          aliases: p.aliases || [],
        }));
        setFullPlayerList(players);
      })
      .catch((err) => {
        console.error("Failed to fetch full player list:", err);
      });
  }, []);

  // Search filtered players (exclude already in expected)
  const filteredPlayers = fullPlayerList.filter((p) =>
    !expectedPlayers.some((e) => e.id === p.id) &&
    (searchTerm === "" ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.fullName?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Add player from search to expected list (persistent for rest of day)
  const addFromSearch = async (player: KnownPlayer) => {
    const today = new Date().toISOString().split("T")[0];
    try {
      await fetch(`${API_BASE}/players/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last_played_date: today }),
      });
      setExpectedPlayers([...expectedPlayers, player]);
      setSearchTerm("");
      setShowSearchResults(false);
    } catch (err) {
      console.error("Failed to add player to expected list:", err);
    }
  };

  // Manual add new player (creates in DB + adds to expected)
  const addNewPlayer = async () => {
    if (!newPlayerFirst || !newPlayerLast) return;

    try {
      const res = await fetch(`${API_BASE}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: newPlayerFirst,
          last_name: newPlayerLast,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to create player");
        return;
      }

      const newPlayer = await res.json();
      const knownPlayer: KnownPlayer = {
        id: newPlayer.id,
        name: newPlayer.display_name,
        voiceName: newPlayer.first_name.toLowerCase(),
        fullName: newPlayer.full_name,
        aliases: newPlayer.aliases || [],
      };

      // Add to both lists
      setFullPlayerList([...fullPlayerList, knownPlayer]);
      setExpectedPlayers([...expectedPlayers, knownPlayer]);

      // Clear form
      setNewPlayerFirst("");
      setNewPlayerLast("");
    } catch (err) {
      console.error("Failed to create player:", err);
      alert("Failed to create player");
    }
  };

  // Ref so startListening always sees current selectedDeviceId
  const selectedDeviceIdRef = useRef(selectedDeviceId);
  selectedDeviceIdRef.current = selectedDeviceId;

  // --- Web Speech API ---
  const startWebSpeech = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Web Speech API not supported in this browser");
      return;
    }

    // Activate selected audio device via getUserMedia before starting recognition.
    // On Chrome this nudges the browser to use the selected device.
    // On iOS Safari, disabling processing + setting audioSession forces
    // the hardware handshake with external mics (e.g. DJI Mic RX).
    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };
      if (selectedDeviceIdRef.current) {
        audioConstraints.deviceId = { exact: selectedDeviceIdRef.current };
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      audioStreamRef.current = stream;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (nav.audioSession) {
        nav.audioSession.type = "play-and-record";
      }
    } catch {
      // Fall back to default mic if device activation fails
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
      const messages: Record<string, string> = {
        network: "Network error — check your internet connection",
        "not-allowed": "Microphone access denied — check browser permissions",
        "audio-capture": "No microphone found — check your audio device",
        aborted: "Speech recognition was aborted",
        "service-not-available": "Speech service unavailable — try Deepgram instead",
        "language-not-supported": "Language not supported",
      };
      if (event.error !== "no-speech") {
        setError(messages[event.error] || `Speech error: ${event.error}`);
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

  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) {
      const ref = recognitionRef.current;
      recognitionRef.current = null;
      ref.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    setListening(false);
  }, []);

  // --- Deepgram streaming ---
  const startDeepgram = useCallback(async () => {
    try {
      addDebugLog("Fetching Deepgram token...");
      const tokenRes = await fetch(`${API_BASE}/deepgram/token`);
      if (!tokenRes.ok) {
        addDebugLog(`Token fetch failed: ${tokenRes.status}`);
        setError("Failed to get Deepgram token — check internet or server config");
        return;
      }
      const tokenData = await tokenRes.json();
      const token = tokenData.token;
      addDebugLog(`Token: ${tokenData.source} — ${token.length} chars`);

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };
      if (selectedDeviceIdRef.current) {
        audioConstraints.deviceId = { exact: selectedDeviceIdRef.current };
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      audioStreamRef.current = stream;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (nav.audioSession) {
        nav.audioSession.type = "play-and-record";
      }

      // Nova-3 uses "keyterm" (not "keywords") — no intensifiers like :5
      // "keywords" is Nova-2-only and causes Safari to get a 400 handshake rejection
      const params = new URLSearchParams({
        model: "nova-3",
        interim_results: "true",
        endpointing: "500",
        utterance_end_ms: "1500",
        smart_format: "true",
      });

      // Add active player names as keyterms
      const currentGame = gameRef.current;
      // Build keywords from current game's players only
      const allKnownPlayers = [...expectedPlayersRef.current, ...fullPlayerListRef.current];
      const uniquePlayers = Array.from(new Map(allKnownPlayers.map(p => [p.id, p])).values());

      const allDisplayNames = [...currentGame.teamA, ...currentGame.teamB];
      for (const displayName of allDisplayNames) {
        const player = uniquePlayers.find((p) => p.name === displayName);
        const voiceName = player?.voiceName || displayName.split(/\s/)[0].toLowerCase();
        const keyterm = voiceName.charAt(0).toUpperCase() + voiceName.slice(1);
        params.append("keyterm", keyterm);

        // Add aliases as keywords too
        if (player?.aliases) {
          for (const alias of player.aliases) {
            const aliasKeyterm = alias.charAt(0).toUpperCase() + alias.slice(1);
            params.append("keyterm", aliasKeyterm);
          }
        }
      }

      // Add basketball vocabulary as keyterms
      const basketballTerms = [
        "bucket", "layup", "dunk", "floater", "three", "deep",
        "downtown", "steal", "block", "assist", "undo", "stat",
      ];
      for (const term of basketballTerms) {
        params.append("keyterm", term);
      }

      const dgUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
      const ws = new WebSocket(dgUrl, ["token", token]);

      addDebugLog(`WS URL ${dgUrl.length} chars`);
      deepgramWsRef.current = ws;

      ws.onopen = () => {
        addDebugLog("WebSocket OPEN — streaming audio");
        dgReconnectCount.current = 0;

        // MediaRecorder approach (Deepgram's recommended browser method)
        const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };
        mediaRecorder.start(250); // 250ms chunks
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const alt = data.channel?.alternatives?.[0];
          if (!alt) return;
          const text = alt.transcript || "";
          if (!text) return;

          if (data.is_final) {
            // Update raw accumulator for display
            dgAccumulatorRef.current += (dgAccumulatorRef.current ? " " : "") + text;
            setInterim(dgAccumulatorRef.current);

            // Parse this segment immediately (don't wait for speech_final)
            // Check if there's a pending name to prepend
            let textToParse = text;
            const pending = pendingNameRef.current;
            if (pending) {
              clearTimeout(pending.timer);
              pendingNameRef.current = null;
              textToParse = pending.name + " " + text;
            }

            handleVoiceResult(textToParse);

            if (data.speech_final) {
              // Reset accumulator display on silence detection
              setTranscript(dgAccumulatorRef.current);
              dgAccumulatorRef.current = "";
            }
          } else {
            // Interim result — show raw audio
            setInterim(
              dgAccumulatorRef.current + (dgAccumulatorRef.current ? " " : "") + text
            );
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        addDebugLog("WebSocket ERROR event fired");
        setError("Deepgram failed to connect — check your internet");
      };

      ws.onclose = (e) => {
        addDebugLog(`WebSocket CLOSED — code: ${e.code}, reason: "${e.reason || "none"}", wasClean: ${e.wasClean}`);
        if (deepgramWsRef.current === ws) {
          // Clean up old audio resources BEFORE reconnecting
          deepgramWsRef.current = null;
          if (mediaRecorderRef.current) {
            try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
            mediaRecorderRef.current = null;
          }
          if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
          }
          if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
          }
          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach((t) => t.stop());
            audioStreamRef.current = null;
          }
          dgAccumulatorRef.current = "";

          const closeMsgs: Record<number, string> = {
            1006: "Network dropped",
            1008: "Auth failed — stop and restart",
            1011: "Deepgram server error",
          };
          if (e.code !== 1000 && speechEngineRef.current === "deepgram") {
            dgReconnectCount.current++;
            addDebugLog(`Reconnect attempt ${dgReconnectCount.current}/3`);
            if (dgReconnectCount.current > 3) {
              addDebugLog("Max retries reached — giving up");
              setError(`Deepgram keeps disconnecting (${closeMsgs[e.code] || `code ${e.code}`}) — stop and restart`);
              setListening(false);
              dgReconnectCount.current = 0;
              return;
            }
            setError(`${closeMsgs[e.code] || `Deepgram disconnected (code ${e.code})`} — reconnecting (${dgReconnectCount.current}/3)...`);
            setTimeout(() => {
              if (speechEngineRef.current === "deepgram") {
                startDeepgram();
              }
            }, 2000);
          }
        }
      };

      setListening(true);
      setError("");
    } catch (err) {
      addDebugLog(`CATCH: ${err instanceof Error ? err.message : String(err)}`);
      setError(`Deepgram error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }, []);

  const stopDeepgram = useCallback(() => {
    if (deepgramWsRef.current) {
      try {
        deepgramWsRef.current.send(new Uint8Array(0));
      } catch { /* ignore */ }
      deepgramWsRef.current.close();
      deepgramWsRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      mediaRecorderRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    dgAccumulatorRef.current = "";
    setListening(false);
  }, []);

  // --- Sherpa-ONNX (local WASM, full model) ---
  const startSherpa = useCallback(async () => {
    try {
      setSherpaStatus("loading");
      addDebugLog("Loading Sherpa-ONNX...");
      const currentGame = gameRef.current;
      const hotwords = buildHotwords(currentGame.teamA, currentGame.teamB);

      const engine = await loadSherpaEngine((msg) => addDebugLog(`Sherpa: ${msg}`), hotwords);
      sherpaEngineRef.current = engine;
      setSherpaStatus("ready");

      const audioConstraints: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      if (selectedDeviceIdRef.current) audioConstraints.deviceId = { exact: selectedDeviceIdRef.current };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      audioStreamRef.current = stream;
      const nav = navigator as never as { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = "play-and-record";

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      sherpaAudioCtxRef.current = audioCtx;
      const actualRate = audioCtx.sampleRate;
      addDebugLog(`AudioContext rate: ${actualRate}`);

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      sherpaProcessorRef.current = processor;
      const recognizerStream = engine.createStream();
      sherpaStreamRef.current = recognizerStream;
      let lastResult = "";

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!sherpaEngineRef.current || !sherpaStreamRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let samples: any = new Float32Array(e.inputBuffer.getChannelData(0));
        if (actualRate !== 16000) samples = downsampleBuffer(samples, actualRate, 16000);
        const rec = sherpaEngineRef.current.recognizer;
        const stm = sherpaStreamRef.current;
        stm.acceptWaveform(16000, samples);
        while (rec.isReady(stm)) rec.decode(stm);
        const isEndpoint = rec.isEndpoint(stm);
        const result = rec.getResult(stm).text;
        if (result.length > 0 && result !== lastResult) { lastResult = result; setInterim(result); }
        if (isEndpoint) {
          if (lastResult.length > 0) {
            const finalText = lastResult; lastResult = "";
            setTranscript(finalText); setInterim("");
            handleVoiceResult(finalText);
          }
          rec.reset(stm);
        }
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);
      setListening(true); setError(""); addDebugLog("Sherpa-ONNX: streaming");
    } catch (err) {
      setSherpaStatus("error");
      addDebugLog(`Sherpa error: ${err instanceof Error ? err.message : String(err)}`);
      setError(`Sherpa error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }, [addDebugLog]);

  const stopSherpa = useCallback(() => {
    if (sherpaProcessorRef.current) { sherpaProcessorRef.current.disconnect(); sherpaProcessorRef.current = null; }
    if (sherpaAudioCtxRef.current) { sherpaAudioCtxRef.current.close().catch(() => {}); sherpaAudioCtxRef.current = null; }
    if (sherpaStreamRef.current) { try { sherpaStreamRef.current.free(); } catch { /* */ } sherpaStreamRef.current = null; }
    if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach((t) => t.stop()); audioStreamRef.current = null; }
    setListening(false);
  }, []);

  // --- Dispatchers ---
  const speechEngineRef = useRef(speechEngine);
  speechEngineRef.current = speechEngine;

  const startListening = useCallback(async () => {
    if (speechEngineRef.current === "deepgram") await startDeepgram();
    else if (speechEngineRef.current === "sherpa") await startSherpa();
    else await startWebSpeech();
  }, [startDeepgram, startSherpa, startWebSpeech]);

  const stopListening = useCallback(() => {
    stopWebSpeech(); stopDeepgram(); stopSherpa();
  }, [stopWebSpeech, stopDeepgram, stopSherpa]);

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

  // --- Notify API when game ends (voice "game over" or manual End Game button) ---
  const prevStatusRef = useRef(game.status);
  useEffect(() => {
    if (prevStatusRef.current !== "finished" && game.status === "finished") {
      stopListening();
      // Save teams for "Run it back"
      const teams = { teamA: game.teamA, teamB: game.teamB, winningTeam: game.winningTeam };
      setLastGameTeams(teams);
      try { localStorage.setItem("lastGameTeams", JSON.stringify(teams)); } catch { /* ignore */ }
      if (game.gameId && game.winningTeam) {
        fetch(`${API_BASE}/games/${game.gameId}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ winning_team: game.winningTeam }),
        }).catch(() => {});
      // Fetch API event IDs so post-game edits work
      if (game.gameId) {
        fetch(`${API_BASE}/games/${game.gameId}/events`)
          .then((r) => r.json())
          .then((apiEvents: { id: number; player_name: string; event_type: string; point_value: number }[]) => {
            setGame((prev) => {
              // Match API events to local events by type + player + points (in order)
              const localScores = prev.events.filter((e) => e.type === "score");
              const apiScores = apiEvents.filter((e) => e.event_type === "score");
              const updated = [...prev.events];
              let apiIdx = 0;
              for (let i = 0; i < updated.length && apiIdx < apiScores.length; i++) {
                if (updated[i].type === "score") {
                  updated[i] = { ...updated[i], apiId: apiScores[apiIdx].id };
                  apiIdx++;
                }
              }
              return { ...prev, events: updated };
            });
          })
          .catch(() => {});
      }
      }
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
    }).then((res) => res.json()).then((data) => {
      if (cmd.assistBy && data.id) {
        fetch(`${API_BASE}/games/${gameId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player_name: cmd.assistBy,
            event_type: "assist",
            point_value: 0,
            raw_transcript: raw,
            assisted_event_id: data.id,
          }),
        }).catch(() => {});
      }
    }).catch(() => {});
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

  function postBlockToApi(gameId: string, playerName: string, raw: string) {
    fetch(`${API_BASE}/games/${gameId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_name: playerName,
        event_type: "block",
        point_value: 0,
        raw_transcript: raw,
      }),
    }).catch(() => {});
  }

  function postFailedTranscript(gameId: string, text: string | null) {
    fetch(`${API_BASE}/games/${gameId}/failed-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
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

  // Ref so handleVoiceResult always sees current players (not stale closure)
  const expectedPlayersRef = useRef<KnownPlayer[]>([]);
  const fullPlayerListRef = useRef<KnownPlayer[]>([]);
  expectedPlayersRef.current = expectedPlayers;
  fullPlayerListRef.current = fullPlayerList;

  // --- Voice command handler ---
  const handleVoiceResult = useCallback((text: string) => {
    const currentGame = gameRef.current;

    if (currentGame.status !== "active") return;

    // Trigger word — always strip "stat" prefix if present; when toggle is on, require it
    const lower = text.toLowerCase().trim();
    const hasStatPrefix = lower.startsWith("stat ") || lower === "stat";
    if (triggerWordRef.current && !hasStatPrefix) return;
    if (hasStatPrefix) {
      text = text.replace(/^stat\s*/i, "").trim();
      if (!text) return;
    }

    // Build voice-to-display mapping for the parser
    const allDisplayNames = [...currentGame.teamA, ...currentGame.teamB];
    const allKnownPlayers = [...expectedPlayersRef.current, ...fullPlayerListRef.current];
    const uniquePlayers = Array.from(new Map(allKnownPlayers.map(p => [p.id, p])).values());

    const voiceToDisplay = new Map<string, string>();
    for (const displayName of allDisplayNames) {
      const player = uniquePlayers.find((p) => p.name === displayName);
      const voice = player?.voiceName || displayName.toLowerCase();
      voiceToDisplay.set(voice, displayName);

      // Also add aliases if available
      if (player?.aliases) {
        for (const alias of player.aliases) {
          voiceToDisplay.set(alias.toLowerCase(), displayName);
        }
      }
    }
    const voiceNames = Array.from(voiceToDisplay.keys());
    const cmd = parseTranscript(text, voiceNames, gameRef.current.scoringMode);

    // Map voice names back to display names
    if (cmd.playerName) {
      cmd.playerName = voiceToDisplay.get(cmd.playerName.toLowerCase()) || cmd.playerName;
    }
    if (cmd.assistBy) {
      cmd.assistBy = voiceToDisplay.get(cmd.assistBy.toLowerCase()) || cmd.assistBy;
    }
    if (cmd.stealBy) {
      cmd.stealBy = voiceToDisplay.get(cmd.stealBy.toLowerCase()) || cmd.stealBy;
    }

    // Name carry-forward: if segment is JUST a known player name, buffer it
    if (cmd.type === "unknown" && text.trim().split(/\s+/).length <= 2) {
      const word = text.trim().toLowerCase();
      const matched = voiceNames.find((v) => word.includes(v));
      if (matched) {
        if (pendingNameRef.current) clearTimeout(pendingNameRef.current.timer);
        const timer = setTimeout(() => { pendingNameRef.current = null; }, 2000);
        pendingNameRef.current = { name: text.trim(), timer };
        return;
      }
    }

    // Reject score/steal/block/assist without a recognized player name
    if ((cmd.type === "score" || cmd.type === "steal" || cmd.type === "block" || cmd.type === "assist") && !cmd.playerName) {
      showRetryAlert(`Didn't catch a name — say again`);
      if (currentGame.gameId) postFailedTranscript(currentGame.gameId, text);
      return;
    }

    // Reject events where the player isn't on either team
    if ((cmd.type === "score" || cmd.type === "steal" || cmd.type === "block" || cmd.type === "assist") && cmd.playerName) {
      if (!allDisplayNames.some((p) => p.toLowerCase() === cmd.playerName!.toLowerCase())) {
        showRetryAlert(`"${cmd.playerName}" isn't in this game`);
        if (currentGame.gameId) postFailedTranscript(currentGame.gameId, text);
        return;
      }
    }

    // --- Bolt-on assist: attach to last score within 5 seconds ---
    if (cmd.type === "assist" && cmd.playerName) {
      const last = lastScoredEventRef.current;
      if (last && Date.now() - last.time < 5000) {
        // Retroactively add assist to the last scored event
        if (currentGame.gameId) {
          fetch(`${API_BASE}/games/${currentGame.gameId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              player_name: cmd.playerName,
              event_type: "assist",
              point_value: 0,
              raw_transcript: text,
              assisted_event_id: last.id,
            }),
          }).catch(() => {});
        }
        setGame((prev) => {
          const events = prev.events.map((e) =>
            e.id === last.id ? { ...e, assistBy: cmd.playerName } : e
          );
          return { ...prev, events };
        });
        showAcceptedCmd(`${cmd.playerName} AST`);
      } else {
        showRetryAlert("No recent score to attach assist to");
      }
      return;
    }

    // Fire API calls ONCE, outside the state updater
    let actedOn: string | null = null;
    if (currentGame.gameId) {
      if (cmd.type === "score" && cmd.playerName && cmd.points) {
        postScoreToApi(currentGame.gameId, cmd, text);
        postFailedTranscript(currentGame.gameId, null);
        actedOn = `${cmd.playerName} +${cmd.points}`;
        if (cmd.assistBy) actedOn += ` (${cmd.assistBy} AST)`;
        showAcceptedCmd(actedOn);
      } else if (cmd.type === "steal" && cmd.playerName) {
        postStealToApi(currentGame.gameId, cmd.playerName, text);
        postFailedTranscript(currentGame.gameId, null);
        actedOn = `${cmd.playerName} STL`;
        showAcceptedCmd(actedOn);
      } else if (cmd.type === "block" && cmd.playerName) {
        postBlockToApi(currentGame.gameId, cmd.playerName, text);
        postFailedTranscript(currentGame.gameId, null);
        actedOn = `${cmd.playerName} BLK`;
        showAcceptedCmd(actedOn);
      } else if (cmd.type === "correction") {
        const lastScore = [...currentGame.events].reverse().find((e) => e.type === "score" && !e.undone);
        if (lastScore) {
          const evtId = lastScore.apiId || lastScore.id;
          fetch(`${API_BASE}/games/${currentGame.gameId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              player_name: lastScore.playerName,
              event_type: "correction",
              point_value: -lastScore.points,
              corrected_event_id: evtId,
              raw_transcript: text,
            }),
          }).catch(() => {});
        }
        actedOn = "UNDO";
        showAcceptedCmd(actedOn);
      } else if (cmd.type === "unknown") {
        postFailedTranscript(currentGame.gameId, text);
      }

      // Save every segment to game_transcripts with acted_on result
      fetch(`${API_BASE}/games/${currentGame.gameId}/transcripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: text, acted_on: actedOn }),
      }).catch(() => {});
    }

    // Pure state update
    setGame((prev) => {
      switch (cmd.type) {
        case "score": {
          const newState = addScore(prev, cmd, text);
          // Track last scored event for bolt-on assists
          const lastEvt = newState.events[newState.events.length - 1];
          if (lastEvt && lastEvt.type === "score") {
            lastScoredEventRef.current = { id: lastEvt.id, time: lastEvt.time };
          }
          return newState;
        }
        case "steal":
          return addSteal(prev, cmd, text);
        case "block":
          return addBlock(prev, cmd, text);
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
  }, [showAcceptedCmd]);

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
      team: getTeam(state, cmd.playerName),
    };
    const events = [...state.events, evt];
    const newState = { ...state, events };
    const scores = calcScores(events, newState);

    return { ...newState, ...scores };
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
      team: getTeam(state, cmd.playerName),
    };
    const events = [...state.events, evt];

    return { ...state, events };
  }

  function addBlock(
    state: GameState,
    cmd: ParsedCommand,
    raw: string
  ): GameState {
    if (!cmd.playerName) return state;
    const evt: ScoringEvent = {
      id: nextId.current++,
      playerName: cmd.playerName,
      points: 0,
      type: "block",
      transcript: raw,
      time: Date.now(),
      team: getTeam(state, cmd.playerName),
    };
    const events = [...state.events, evt];

    return { ...state, events };
  }

  function undoLast(state: GameState, raw: string): GameState {
    const lastScore = [...state.events]
      .reverse()
      .find((e) => e.type === "score" && !e.undone);
    if (!lastScore) return state;
    const events = state.events.map((e) =>
      e.id === lastScore.id ? { ...e, undone: true } : e
    );
    const correction: ScoringEvent = {
      id: nextId.current++,
      playerName: lastScore.playerName,
      points: -lastScore.points,
      type: "correction",
      transcript: raw,
      time: Date.now(),
    };
    const allEvents = [...events, correction];
    const newState = { ...state, events: allEvents };
    const scores = calcScores(allEvents, newState);
    return { ...newState, ...scores };
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


  // --- Game lifecycle ---
  function startGame(target: number, mode?: ScoringMode) {
    if (target < 1) return;
    setAssignments({});
    setGame((prev) => ({ ...prev, status: "setup", targetScore: target, scoringMode: mode ?? prev.scoringMode }));
  }

  function runItBack(target: number, mode?: ScoringMode) {
    const last = lastGameTeams;
    if (!last) return;
    // Winners become Team A
    const newA = last.winningTeam === "B" ? last.teamB : last.teamA;
    const newB = last.winningTeam === "B" ? last.teamA : last.teamB;
    const newAssignments: Record<string, PlayerAssignment> = {};
    for (const name of newA) newAssignments[name] = "A";
    for (const name of newB) newAssignments[name] = "B";
    setAssignments(newAssignments);
    setGame((prev) => ({ ...prev, status: "setup", targetScore: target, scoringMode: mode ?? prev.scoringMode }));
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
        body: JSON.stringify({ location: "Pickup", target_score: game.targetScore, scoring_mode: game.scoringMode }),
      });
      const data = await res.json();
      gameId = data.id;

      // Build full_name map from known players
      const fullNames: Record<string, string> = {};
      const allKnownPlayers = [...expectedPlayersRef.current, ...fullPlayerListRef.current];
      const uniquePlayers = Array.from(new Map(allKnownPlayers.map(p => [p.id, p])).values());

      for (const displayName of [...teamA, ...teamB]) {
        const player = uniquePlayers.find((p) => p.name === displayName);
        if (player?.fullName) fullNames[displayName] = player.fullName;
      }

      await fetch(`${API_BASE}/games/${gameId}/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_a: teamA, team_b: teamB, full_names: fullNames }),
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
      router.push("/games");
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
    router.push("/games");
  }

  function resetGame() {
    stopListening();
    setGame(initial);
    setTranscript("");
    setInterim("");
    setAssignments({});
    watchUndoCountRef.current = 0;
    setNewPlayerFirst("");
    setNewPlayerLast("");
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
  if (authLoading || !isAdmin) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  return (
    <div className="max-w-lg mx-auto relative">
      {/* Green flash overlay */}
      {flashGreen && (
        <div
          className="fixed inset-0 pointer-events-none z-50"
          style={{
            background: "rgba(34, 197, 94, 1)",
            animation: "flashFade 1000ms ease-out forwards",
          }}
        />
      )}
      <style>{`@keyframes flashFade { from { opacity: 1; } to { opacity: 0; } }`}</style>

      {/* Fullscreen scoreboard modal */}
      {showScoreboard && (
        <div
          className="fixed inset-0 z-40 bg-black flex flex-col items-center justify-center"
          onClick={() => setShowScoreboard(false)}
        >
          <div className="text-xs text-gray-600 font-display tracking-wider mb-6">TAP TO CLOSE</div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-xl text-blue-400 font-display tracking-widest">TEAM A</div>
              <div className="text-[200px] font-display leading-none tabular-nums">{game.teamAScore}</div>
              <div className="text-sm text-gray-500 mt-3">{game.teamA.join(", ")}</div>
            </div>
            <div className="text-4xl text-gray-700 font-display">-</div>
            <div className="text-center">
              <div className="text-xl text-orange-400 font-display tracking-widest">TEAM B</div>
              <div className="text-[200px] font-display leading-none tabular-nums">{game.teamBScore}</div>
              <div className="text-sm text-gray-500 mt-3">{game.teamB.join(", ")}</div>
            </div>
          </div>
          {game.status === "active" && (
            <div className="text-red-400 text-lg font-display tracking-widest mt-8 animate-pulse">LIVE</div>
          )}
        </div>
      )}

      {/* Scoreboard */}
      <div className="flex items-center justify-between py-6">
        <div className="text-center flex-1">
          <div className="text-xs text-gray-500 tracking-wider font-display">TEAM A</div>
          <div className="text-6xl font-bold font-display tabular-nums">
            {game.teamAScore}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-600 mt-1">
            {game.teamA.join(", ") || setupTeamA.join(", ") || "—"}
          </div>
        </div>
        <div className="text-center px-4">
          <div className="text-gray-400 dark:text-gray-600 font-bold">VS</div>
          <div
            className={`text-xs font-bold mt-1 ${game.status === "active" ? "text-red-400" : "text-gray-400 dark:text-gray-600"}`}
          >
            {game.status === "active"
              ? "LIVE"
              : game.status === "finished"
                ? "FINAL"
                : ""}
          </div>
          {game.status === "active" && (
            <>
              <button
                className="text-sm text-blue-400 mt-1 px-2 py-0.5 border border-blue-500/50 rounded hover:bg-blue-500/10 transition-colors"
                onClick={() => {
                  const input = prompt("Change target score:", String(game.targetScore));
                  if (!input) return;
                  const val = parseInt(input);
                  if (isNaN(val) || val < 1) return;
                  setGame((prev) => ({ ...prev, targetScore: val }));
                  if (game.gameId) {
                    fetch(`${API_BASE}/games/${game.gameId}/target-score`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ target_score: val }),
                    }).catch(() => {});
                  }
                }}
              >
                to {game.targetScore}
              </button>
              <div className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                {game.scoringMode === "2s3s" ? "2s & 3s" : "1s & 2s"}
              </div>
            </>
          )}
        </div>
        <div className="text-center flex-1">
          <div className="text-xs text-gray-500 tracking-wider font-display">TEAM B</div>
          <div className="text-6xl font-bold font-display tabular-nums">
            {game.teamBScore}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-600 mt-1">
            {game.teamB.join(", ") || setupTeamB.join(", ") || "—"}
          </div>
        </div>
      </div>

      {/* Listening indicator + scoreboard button */}
      {game.status === "active" && (
        <div className="flex items-center justify-center gap-3 py-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${listening ? "bg-green-400 animate-pulse" : "bg-gray-600"}`}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {listening ? "Listening..." : "Mic off"}
          </span>
          <button
            onClick={() => setShowScoreboard(true)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-700 px-2 py-0.5 rounded transition-colors"
          >
            Fullscreen
          </button>
        </div>
      )}

      {/* Dual transcript display */}
      {(transcript || interim || acceptedCmd) && (
        <div className="text-center py-1 space-y-0.5">
          {(interim || transcript) && (
            <div className="text-sm text-gray-500 italic">
              &ldquo;{interim || transcript}&rdquo;
            </div>
          )}
          {acceptedCmd && (
            <div className="text-sm text-green-400 font-semibold">
              {acceptedCmd}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-auto max-w-sm py-2 px-4 bg-red-50 dark:bg-red-900/60 border border-red-300 dark:border-red-500 rounded-lg flex items-center justify-between gap-2">
          <span className="text-red-600 dark:text-red-200 text-sm font-medium">{error}</span>
          <button
            onClick={() => setError("")}
            className="text-red-400 hover:text-red-200 text-lg font-bold leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* Debug log */}
      {debugLog.length > 0 && (
        <div className="py-1">
          <button
            onClick={() => setShowDebug((p) => !p)}
            className="text-xs text-gray-400 dark:text-gray-600 underline"
          >
            {showDebug ? "Hide" : "Show"} debug log ({debugLog.length})
          </button>
          {showDebug && (
            <div className="mt-1">
              <button
                onClick={() => navigator.clipboard.writeText(debugLog.join("\n"))}
                className="text-xs text-blue-500 underline mb-1"
              >
                Copy log
              </button>
              <div className="p-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded text-xs text-gray-500 dark:text-gray-400 font-mono max-h-40 overflow-y-auto">
                {debugLog.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- Idle: start game --- */}
      {game.status === "idle" && (
        <div className="space-y-3 py-6">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-xs text-gray-500">Scoring:</span>
            <button
              onClick={() => setGame((prev) => ({ ...prev, scoringMode: "1s2s" }))}
              className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${
                game.scoringMode === "1s2s"
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
              }`}
            >
              1s & 2s
            </button>
            <button
              onClick={() => setGame((prev) => ({ ...prev, scoringMode: "2s3s" }))}
              className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${
                game.scoringMode === "2s3s"
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
              }`}
            >
              2s & 3s
            </button>
          </div>
          {activeGameData && (
            <button
              onClick={resumeGame}
              className="w-full py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg transition-colors"
            >
              Resume Active Game ({activeGameData.team_a_score}-{activeGameData.team_b_score})
            </button>
          )}
          {lastGameTeams && (
            <button
              onClick={() => runItBack(game.targetScore)}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
            >
              Run It Back — Same Teams
            </button>
          )}
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
          <div className="flex gap-3 items-center">
            <input
              type="number"
              min={1}
              placeholder="Custom"
              className="flex-1 py-2.5 px-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg text-center focus:border-blue-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = parseInt((e.target as HTMLInputElement).value);
                  if (val >= 1) startGame(val);
                }
              }}
              id="custom-target"
            />
            <button
              onClick={() => {
                const el = document.getElementById("custom-target") as HTMLInputElement;
                const val = parseInt(el?.value);
                if (val >= 1) startGame(val);
              }}
              className="py-2.5 px-4 border border-blue-600 text-blue-400 font-semibold rounded-lg hover:bg-blue-600/10 transition-colors"
            >
              Go
            </button>
          </div>
        </div>
      )}

      {/* --- Setup: pick teams --- */}
      {game.status === "setup" && (
        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Tap to assign: <span className="text-blue-400">Team A</span> →{" "}
            <span className="text-orange-400">Team B</span> → unassigned
          </p>
          {playersSource === "registry" && (
            <p className="text-xs text-green-600 text-center">Expected to play today</p>
          )}
          {playersSource === "loading" && (
            <p className="text-xs text-gray-400 dark:text-gray-600 text-center">Loading players...</p>
          )}

          {/* Expected to Play - Player grid */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">EXPECTED TO PLAY</h3>
            <div className="flex flex-wrap gap-2">
              {expectedPlayers.map((player) => (
                <button
                  key={player.id}
                  onClick={() => cyclePlayer(player.name)}
                  className={`min-w-[5rem] px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    assignments[player.name] === "A"
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : assignments[player.name] === "B"
                        ? "bg-orange-600/20 border-orange-500 text-orange-300"
                        : "bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {player.name}
                </button>
              ))}
            </div>
          </div>

          {/* Search from Full List */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">ADD FROM FULL LIST</h3>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowSearchResults(e.target.value.length > 0);
                }}
                onFocus={() => setShowSearchResults(searchTerm.length > 0)}
                placeholder="Search players..."
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
              />
              {showSearchResults && filteredPlayers.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredPlayers.slice(0, 20).map((player) => (
                    <button
                      key={player.id}
                      onClick={() => addFromSearch(player)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-white"
                    >
                      {player.name}
                      {player.fullName && (
                        <span className="text-gray-500 dark:text-gray-400 ml-2">({player.fullName})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Add New Player */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">ADD NEW PLAYER</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPlayerFirst}
                onChange={(e) => setNewPlayerFirst(e.target.value)}
                placeholder="First name"
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={newPlayerLast}
                onChange={(e) => setNewPlayerLast(e.target.value)}
                placeholder="Last name"
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === "Enter" && addNewPlayer()}
              />
              <button
                onClick={addNewPlayer}
                disabled={!newPlayerFirst || !newPlayerLast}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:text-gray-400 text-gray-900 dark:text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Team preview */}
          <div className="flex gap-4 text-sm">
            <div className="flex-1">
              <div className="text-blue-400 font-semibold mb-1">
                Team A ({setupTeamA.length})
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                {setupTeamA.join(", ") || "—"}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-orange-400 font-semibold mb-1">
                Team B ({setupTeamB.length})
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                {setupTeamB.join(", ") || "—"}
              </div>
            </div>
          </div>

          {/* Start game button */}
          <button
            onClick={confirmTeams}
            disabled={setupTeamA.length === 0 || setupTeamB.length === 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            Start Game (to {game.targetScore}, {game.scoringMode === "2s3s" ? "2s & 3s" : "1s & 2s"})
          </button>
        </div>
      )}

      {/* --- Retry alert --- */}
      {retryAlert && (
        <div className="mx-auto max-w-sm py-2 px-4 bg-red-50 dark:bg-red-900/80 border border-red-300 dark:border-red-500 rounded-lg text-center text-red-600 dark:text-red-200 text-sm font-semibold animate-pulse">
          {retryAlert}
        </div>
      )}

      {/* --- Active: controls --- */}
      {game.status === "active" && (
        <div className="space-y-3 py-4">
          {/* Speech engine selector */}
          {!listening && (
            <>
              <select
                value={speechEngine}
                onChange={(e) => setSpeechEngine(e.target.value as "browser" | "deepgram" | "sherpa")}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-500"
              >
                <option value="deepgram">Deepgram</option>
                <option value="sherpa">Sherpa-ONNX (Local, Free)</option>
                <option value="browser">Browser Speech</option>
              </select>
              {speechEngine === "sherpa" && sherpaStatus !== "ready" && (
                <p className="text-xs text-gray-500 mt-1">~191MB download first time (larger model, cached permanently)</p>
              )}
              {speechEngine === "sherpa" && sherpaStatus === "ready" && (
                <p className="text-xs text-green-400 mt-1">Model loaded (runs locally, free)</p>
              )}
            </>
          )}


          {/* Trigger word toggle */}
          {!listening && (
            <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={triggerWord}
                onChange={(e) => setTriggerWord(e.target.checked)}
                className="rounded"
              />
              Require &ldquo;STAT&rdquo; trigger word
            </label>
          )}

          {/* Audio device selector */}
          {!listening && (
            <div className="flex gap-2">
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">Default Microphone</option>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
              <button
                onClick={refreshDevices}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-500 dark:text-gray-400 transition-colors"
                title="Refresh device list"
              >
                Refresh
              </button>
            </div>
          )}

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

          {/* Manual undo */}
          <button
            onClick={manualUndo}
            className="w-full py-2.5 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900 text-red-700 dark:text-white font-semibold rounded-lg transition-colors"
          >
            Undo
          </button>

          {/* Edit Teams mid-game */}
          <details className="text-left">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-900 dark:hover:text-gray-300 text-center">Edit Teams</summary>
            <div className="mt-2 space-y-3 p-3 border border-gray-200 dark:border-gray-800 rounded-lg">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-blue-400 font-semibold mb-1">Team A</div>
                  {game.teamA.map((name) => (
                    <div key={name} className="flex items-center justify-between py-0.5">
                      <span className="text-sm">{name}</span>
                      <button
                        onClick={() => {
                          setGame((prev) => ({
                            ...prev,
                            teamA: prev.teamA.filter((p) => p !== name),
                            teamB: [...prev.teamB, name],
                          }));
                          if (game.gameId) {
                            fetch(`${API_BASE}/games/${game.gameId}/roster`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ player_name: name, new_team: "B" }),
                            }).catch(() => {});
                          }
                        }}
                        className="text-xs text-orange-400 hover:text-orange-300"
                      >
                        → B
                      </button>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs text-orange-400 font-semibold mb-1">Team B</div>
                  {game.teamB.map((name) => (
                    <div key={name} className="flex items-center justify-between py-0.5">
                      <span className="text-sm">{name}</span>
                      <button
                        onClick={() => {
                          setGame((prev) => ({
                            ...prev,
                            teamB: prev.teamB.filter((p) => p !== name),
                            teamA: [...prev.teamA, name],
                          }));
                          if (game.gameId) {
                            fetch(`${API_BASE}/games/${game.gameId}/roster`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ player_name: name, new_team: "A" }),
                            }).catch(() => {});
                          }
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        → A
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add player..."
                  className="flex-1 px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const name = (e.target as HTMLInputElement).value.trim();
                      if (!name) return;
                      setGame((prev) => ({ ...prev, teamA: [...prev.teamA, name] }));
                      if (game.gameId) {
                        fetch(`${API_BASE}/games/${game.gameId}/roster`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ player_name: name, new_team: "A" }),
                        }).catch(() => {});
                      }
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
            </div>
          </details>

          <button
            onClick={() => {
              const winner =
                game.teamAScore > game.teamBScore ? "A" : "B";
              if (confirm(`End game? Team ${winner} wins?`)) endGame(winner);
            }}
            className="w-full py-2.5 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
          >
            End Game
          </button>
        </div>
      )}

      {/* --- Finished --- */}
      {game.status === "finished" && (
        <div className="space-y-3 py-6 text-center">
          <div className="text-2xl font-bold font-display text-yellow-400">
            Team {game.winningTeam} wins!
          </div>
          {game.gameId && (
            <div className="my-4 text-left">
              <BoxScore gameId={game.gameId} />
            </div>
          )}
          {/* Game Flow Chart */}
          {(() => {
            const teamASet = new Set(game.teamA.map((n) => n.toLowerCase()));
            let a = 0, b = 0;
            const flowData: { play: number; "Team A": number; "Team B": number }[] = [
              { play: 0, "Team A": 0, "Team B": 0 },
            ];
            let playNum = 0;
            for (const evt of game.events) {
              if (evt.type === "score" && !evt.undone) {
                const isTeamA = teamASet.has(evt.playerName.toLowerCase());
                if (isTeamA) a += evt.points; else b += evt.points;
                playNum++;
                flowData.push({ play: playNum, "Team A": a, "Team B": b });
              }
            }
            if (flowData.length <= 1) return null;
            return (
              <div className="my-4 text-left">
                <h3 className="text-sm text-gray-500 mb-2">Game Flow</h3>
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-white dark:bg-transparent">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={flowData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                      <XAxis dataKey="play" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px", color: "#E5E7EB" }}
                        labelFormatter={(v) => `Play ${v}`}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(value) => <span style={{ color: "#D1D5DB" }}>{value}</span>} />
                      <Line type="monotone" dataKey="Team A" stroke="#3B82F6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Team B" stroke="#F97316" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
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
          <p className="text-sm text-gray-300 dark:text-gray-700 text-center py-8">
            {game.status === "active"
              ? 'Say "bucket" (+1) or "two" (+2), with a name for other players'
              : "Start a game to begin tracking"}
          </p>
        ) : (
          <div className="space-y-1">
            {(() => {
              const playNumbers = new Map<number, number>();
              let playCount = 0;
              for (const e of game.events) {
                if (e.type === "score" && !e.undone) { playCount++; playNumbers.set(e.id, playCount); }
              }
              return [...game.events].reverse().map((evt) => (
              <div
                key={evt.id}
                className={`flex items-center gap-3 py-1.5 border-b border-gray-100 dark:border-gray-900 ${
                  evt.type === "correction" || evt.undone ? "opacity-40" : ""
                }`}
              >
                <span className="text-xs text-gray-400 dark:text-gray-600 w-5 text-right tabular-nums">
                  {playNumbers.get(evt.id) ?? ""}
                </span>
                <div className={`text-sm flex-1 ${evt.undone ? "line-through" : ""}`}>
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
                    evt.type === "correction" || evt.undone
                      ? "text-red-400"
                      : evt.type === "steal"
                        ? "text-yellow-400"
                        : evt.type === "block"
                          ? "text-purple-400"
                          : "text-green-400"
                  }`}
                >
                  {evt.type === "correction"
                    ? "UNDO"
                    : evt.type === "steal"
                      ? "STL"
                      : evt.type === "block"
                        ? "BLK"
                        : `+${evt.points}`}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-600 w-12 text-right">
                  {new Date(evt.time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {game.status === "finished" && evt.type === "score" && (
                  <div className="flex gap-1 ml-1">
                    <button
                      onClick={() => {
                        const newName = prompt("Player name:", evt.playerName);
                        if (!newName || newName === evt.playerName) return;
                        const evtId = evt.apiId || evt.id;
                        if (game.gameId) {
                          fetch(`${API_BASE}/games/${game.gameId}/events/${evtId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ player_name: newName }),
                          }).catch(() => {});
                        }
                        setGame((prev) => {
                          const events = prev.events.map((e) =>
                            e.id === evt.id ? { ...e, playerName: newName, team: getTeam(prev, newName) } : e
                          );
                          const scores = calcScores(events.filter((e) => e.type === "score"), { ...prev, events });
                          return { ...prev, events, ...scores };
                        });
                      }}
                      className="text-xs text-gray-400 dark:text-gray-600 hover:text-blue-400"
                      title="Edit player"
                    >
                      &#9998;
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm(`Delete ${evt.playerName} +${evt.points}?`)) return;
                        const evtId = evt.apiId || evt.id;
                        if (game.gameId) {
                          fetch(`${API_BASE}/games/${game.gameId}/events/${evtId}`, {
                            method: "DELETE",
                          }).catch(() => {});
                        }
                        setGame((prev) => {
                          const events = prev.events.filter((e) => e.id !== evt.id);
                          const scores = calcScores(events.filter((e) => e.type === "score"), { ...prev, events });
                          return { ...prev, events, ...scores };
                        });
                      }}
                      className="text-xs text-gray-400 dark:text-gray-600 hover:text-red-400"
                      title="Delete"
                    >
                      &#10005;
                    </button>
                  </div>
                )}
              </div>
            ));
            })()}
          </div>
        )}
      </div>

    </div>
  );
}
