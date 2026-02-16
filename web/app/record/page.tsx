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
    if (e.type === "correction") continue;
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
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const addDebugLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setDebugLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);
  const nextId = useRef(1);
  const watchUndoCountRef = useRef(0);

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

  // Known players from GroupMe API (falls back to hardcoded list)
  const [knownPlayers, setKnownPlayers] = useState<KnownPlayer[]>(DEFAULT_PLAYERS);
  const [playersSource, setPlayersSource] = useState<"loading" | "groupme" | "fallback">("loading");
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

  // Fetch players from GroupMe on mount
  useEffect(() => {
    fetch(`${API_BASE}/groupme/members`)
      .then((res) => {
        if (!res.ok) throw new Error("GroupMe API error");
        return res.json();
      })
      .then((players: { fullName: string; displayName: string; voiceName: string }[]) => {
        if (players.length > 0) {
          const gmPlayers = players.map((p) => ({
            id: p.displayName,
            name: p.displayName,
            voiceName: p.voiceName,
            fullName: p.fullName,
          }));
          setKnownPlayers([...gmPlayers, ...EXTRA_PLAYERS]);
          setPlayersSource("groupme");
        } else {
          setPlayersSource("fallback");
        }
      })
      .catch(() => {
        setPlayersSource("fallback");
      });
  }, []);
  // For adding new player names not in the list
  const [newPlayerName, setNewPlayerName] = useState("");

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
        // Save raw transcript to DB before parsing (captures even failed parses)
        const gid = gameRef.current.gameId;
        if (gid && gameRef.current.status === "active") {
          fetch(`${API_BASE}/games/${gid}/transcripts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw_text: finalText }),
          }).catch(() => {});
        }
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
        endpointing: "300",
        utterance_end_ms: "1000",
        smart_format: "true",
      });

      // Add active player names as keyterms
      const currentGame = gameRef.current;
      const allPlayers = [...currentGame.teamA, ...currentGame.teamB];
      for (const displayName of allPlayers) {
        const player = knownPlayersRef.current.find((p) => p.name === displayName);
        const voiceName = player?.voiceName || displayName.split(/\s/)[0].toLowerCase();
        const keyterm = voiceName.charAt(0).toUpperCase() + voiceName.slice(1);
        params.append("keyterm", keyterm);
      }

      // Add basketball vocabulary as keyterms
      const basketballTerms = [
        "bucket", "layup", "dunk", "floater", "three", "deep",
        "downtown", "steal", "block", "assist", "undo",
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
            dgAccumulatorRef.current += (dgAccumulatorRef.current ? " " : "") + text;
            if (data.speech_final) {
              const fullText = dgAccumulatorRef.current;
              dgAccumulatorRef.current = "";
              setTranscript(fullText);
              setInterim("");
              const gid = gameRef.current.gameId;
              if (gid && gameRef.current.status === "active") {
                fetch(`${API_BASE}/games/${gid}/transcripts`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ raw_text: fullText }),
                }).catch(() => {});
              }
              handleVoiceResult(fullText);
            } else {
              setInterim(dgAccumulatorRef.current);
            }
          } else {
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
            const gid = gameRef.current.gameId;
            if (gid && gameRef.current.status === "active") {
              fetch(`${API_BASE}/games/${gid}/transcripts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw_text: finalText }) }).catch(() => {});
            }
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

  // --- Notify API when game auto-ends (target score reached or voice "game over") ---
  const prevStatusRef = useRef(game.status);
  useEffect(() => {
    if (prevStatusRef.current !== "finished" && game.status === "finished") {
      stopListening();
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

  // Ref so handleVoiceResult always sees current knownPlayers (not stale closure)
  const knownPlayersRef = useRef<KnownPlayer[]>(DEFAULT_PLAYERS);
  knownPlayersRef.current = knownPlayers;

  // --- Voice command handler ---
  const handleVoiceResult = useCallback((text: string) => {
    const currentGame = gameRef.current;

    if (currentGame.status !== "active") return;

    // Build voice-to-display mapping for the parser
    const allDisplayNames = [...currentGame.teamA, ...currentGame.teamB];
    const voiceToDisplay = new Map<string, string>();
    for (const displayName of allDisplayNames) {
      const player = knownPlayersRef.current.find((p) => p.name === displayName);
      const voice = player?.voiceName || displayName.toLowerCase();
      voiceToDisplay.set(voice, displayName);
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

    // Reject score/steal/block without a recognized player name
    if ((cmd.type === "score" || cmd.type === "steal" || cmd.type === "block") && !cmd.playerName) {
      showRetryAlert(`Didn't catch a name — say again`);
      if (currentGame.gameId) postFailedTranscript(currentGame.gameId, text);
      return;
    }

    // Reject events where the player isn't on either team
    if ((cmd.type === "score" || cmd.type === "steal" || cmd.type === "block") && cmd.playerName) {
      if (!allDisplayNames.some((p) => p.toLowerCase() === cmd.playerName!.toLowerCase())) {
        showRetryAlert(`"${cmd.playerName}" isn't in this game`);
        if (currentGame.gameId) postFailedTranscript(currentGame.gameId, text);
        return;
      }
    }

    // Fire API calls ONCE, outside the state updater
    if (currentGame.gameId) {
      if (cmd.type === "score" && cmd.playerName && cmd.points) {
        postScoreToApi(currentGame.gameId, cmd, text);
        postFailedTranscript(currentGame.gameId, null); // clear on success

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
        postFailedTranscript(currentGame.gameId, null); // clear on success
      } else if (cmd.type === "block" && cmd.playerName) {
        postBlockToApi(currentGame.gameId, cmd.playerName, text);
        postFailedTranscript(currentGame.gameId, null); // clear on success
      } else if (cmd.type === "correction") {
        // Find last score event to record correction in DB
        const lastScore = [...currentGame.events].reverse().find((e) => e.type === "score");
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
      } else if (cmd.type === "unknown") {
        postFailedTranscript(currentGame.gameId, text);
      }
    }

    // Pure state update
    setGame((prev) => {
      switch (cmd.type) {
        case "score":
          return addScore(prev, cmd, text);
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
      team: getTeam(state, cmd.playerName),
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
    setKnownPlayers((prev) => [...prev, { id: name, name, voiceName: name.toLowerCase() }]);
    setAssignments((prev) => ({ ...prev, [name]: "A" }));
    setNewPlayerName("");
    setError("");
  }

  // --- Game lifecycle ---
  function startGame(target: number, mode?: ScoringMode) {
    if (target < 1) return;
    setAssignments({});
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
  if (authLoading || !isAdmin) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

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
              <div className="text-xs text-gray-600 mt-0.5">
                {game.scoringMode === "2s3s" ? "2s & 3s" : "1s & 2s"}
              </div>
            </>
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
      {game.status === "active" && (
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
        <div className="mx-auto max-w-sm py-2 px-4 bg-red-900/60 border border-red-500 rounded-lg flex items-center justify-between gap-2">
          <span className="text-red-200 text-sm font-medium">{error}</span>
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
            className="text-xs text-gray-600 underline"
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
              <div className="p-2 bg-gray-950 border border-gray-800 rounded text-xs text-gray-400 font-mono max-h-40 overflow-y-auto">
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
                  : "border border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              1s & 2s
            </button>
            <button
              onClick={() => setGame((prev) => ({ ...prev, scoringMode: "2s3s" }))}
              className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${
                game.scoringMode === "2s3s"
                  ? "bg-blue-600 text-white"
                  : "border border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              2s & 3s
            </button>
          </div>
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
              className="flex-1 py-2.5 px-3 bg-gray-900 border border-gray-700 text-white rounded-lg text-center focus:border-blue-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
          <p className="text-sm text-gray-400 text-center">
            Tap to assign: <span className="text-blue-400">Team A</span> →{" "}
            <span className="text-orange-400">Team B</span> → unassigned
          </p>
          {playersSource === "groupme" && (
            <p className="text-xs text-green-600 text-center">Players from GroupMe (last 2 days)</p>
          )}
          {playersSource === "loading" && (
            <p className="text-xs text-gray-600 text-center">Loading players from GroupMe...</p>
          )}

          {/* Player grid */}
          <div className="flex flex-wrap gap-2">
            {knownPlayers.map((player) => (
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
            Start Game (to {game.targetScore}, {game.scoringMode === "2s3s" ? "2s & 3s" : "1s & 2s"})
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
          {/* Speech engine selector */}
          {!listening && (
            <>
              <select
                value={speechEngine}
                onChange={(e) => setSpeechEngine(e.target.value as "browser" | "deepgram" | "sherpa")}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
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


          {/* Audio device selector */}
          {!listening && (
            <div className="flex gap-2">
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
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
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-400 transition-colors"
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
            className="w-full py-2.5 bg-red-900/50 hover:bg-red-900 text-white font-semibold rounded-lg transition-colors"
          >
            Undo
          </button>

          {/* Edit Teams mid-game */}
          <details className="text-left">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 text-center">Edit Teams</summary>
            <div className="mt-2 space-y-3 p-3 border border-gray-800 rounded-lg">
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
                  className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
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
              if (evt.type === "score") {
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
                <div className="border border-gray-800 rounded-lg p-3">
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
          <p className="text-sm text-gray-700 text-center py-8">
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
                if (e.type === "score") { playCount++; playNumbers.set(e.id, playCount); }
              }
              return [...game.events].reverse().map((evt) => (
              <div
                key={evt.id}
                className={`flex items-center gap-3 py-1.5 border-b border-gray-900 ${
                  evt.type === "correction" ? "opacity-40" : ""
                }`}
              >
                <span className="text-xs text-gray-600 w-5 text-right tabular-nums">
                  {playNumbers.get(evt.id) ?? ""}
                </span>
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
                <span className="text-xs text-gray-600 w-12 text-right">
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
                      className="text-xs text-gray-600 hover:text-blue-400"
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
                      className="text-xs text-gray-600 hover:text-red-400"
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
