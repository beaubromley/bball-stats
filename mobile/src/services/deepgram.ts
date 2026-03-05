import { useCallback, useRef, useState } from "react";
import { startAudioStream, stopAudioStream, addAudioListener } from "../../modules/audio-stream/src/index";
import type { EventSubscription } from "expo-modules-core";
import { getAuthToken } from "./api";

export interface DeepgramResult {
  transcript: string;
  isFinal: boolean;
}

const API_BASE = "https://bball-stats-vert.vercel.app/api";

const BASKETBALL_KEYTERMS = [
  "bucket", "layup", "three", "steal", "block", "assist", "undo", "redo", "stat",
];

/**
 * Deepgram Nova-3 WebSocket streaming engine.
 *
 * Captures raw PCM audio via native AudioStream module and streams
 * to Deepgram for real-time transcription. Matches the web app's
 * Deepgram implementation exactly.
 */
export function useDeepgram(
  onResult: (result: DeepgramResult) => void,
  knownPlayers: string[] = []
) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const knownPlayersRef = useRef(knownPlayers);
  knownPlayersRef.current = knownPlayers;

  const wsRef = useRef<WebSocket | null>(null);
  const audioSubRef = useRef<EventSubscription | null>(null);
  const accumulatorRef = useRef("");
  const reconnectCountRef = useRef(0);
  const shouldBeListeningRef = useRef(false);

  const cleanup = useCallback(() => {
    if (audioSubRef.current) {
      audioSubRef.current.remove();
      audioSubRef.current = null;
    }
    stopAudioStream();

    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    accumulatorRef.current = "";
  }, []);

  const startStreaming = useCallback(async () => {
    try {
      // Fetch Deepgram token from our API
      const token = await getAuthToken();
      if (!token) {
        setError("Not authenticated — log in first");
        return;
      }

      const tokenRes = await fetch(`${API_BASE}/deepgram/token`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!tokenRes.ok) {
        setError("Failed to get Deepgram token");
        return;
      }

      const tokenData = await tokenRes.json();
      const dgToken = tokenData.token;
      if (!dgToken) {
        setError("Deepgram not configured on server");
        return;
      }

      // Build WebSocket URL with params matching web app
      const params = new URLSearchParams({
        model: "nova-3",
        interim_results: "true",
        endpointing: "500",
        utterance_end_ms: "1500",
        smart_format: "true",
        encoding: "linear16",
        sample_rate: "16000",
        channels: "1",
      });

      // Add player names as keyterms (Nova-3 uses keyterm, not keywords)
      for (const name of knownPlayersRef.current) {
        const firstName = name.split(/\s/)[0].toLowerCase();
        const keyterm = firstName.charAt(0).toUpperCase() + firstName.slice(1);
        params.append("keyterm", keyterm);
      }

      // Add basketball vocabulary as keyterms
      for (const term of BASKETBALL_KEYTERMS) {
        params.append("keyterm", term);
      }

      const dgUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

      // Connect WebSocket with token as subprotocol
      const ws = new WebSocket(dgUrl, ["token", dgToken]);
      wsRef.current = ws;

      ws.onopen = async () => {
        setIsListening(true);
        setError(null);
        reconnectCountRef.current = 0;
        accumulatorRef.current = "";

        // Start native audio capture and stream to WebSocket
        try {
          await startAudioStream(16000);

          audioSubRef.current = addAudioListener((event) => {
            if (ws.readyState === WebSocket.OPEN) {
              // Decode base64 to binary and send
              const binary = Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0));
              ws.send(binary.buffer);
            }
          });
        } catch (audioErr) {
          setError(`Audio capture failed: ${audioErr instanceof Error ? audioErr.message : String(audioErr)}`);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          const alt = data.channel?.alternatives?.[0];
          if (!alt) return;

          const text = alt.transcript || "";
          if (!text) return;

          if (data.is_final) {
            // Final result for this segment — accumulate and parse
            accumulatorRef.current += (accumulatorRef.current ? " " : "") + text;

            // Emit as final for immediate processing
            onResultRef.current({ transcript: text, isFinal: true });

            // If speech_final (silence detected), reset accumulator
            if (data.speech_final) {
              accumulatorRef.current = "";
            }
          } else {
            // Interim result — show in real-time
            const interimFull =
              accumulatorRef.current + (accumulatorRef.current ? " " : "") + text;
            onResultRef.current({ transcript: interimFull, isFinal: false });
          }
        } catch {
          // Ignore JSON parse errors
        }
      };

      ws.onerror = () => {
        setError("Deepgram WebSocket error");
      };

      ws.onclose = (e) => {
        // Cleanup audio
        if (audioSubRef.current) {
          audioSubRef.current.remove();
          audioSubRef.current = null;
        }
        stopAudioStream();
        wsRef.current = null;
        accumulatorRef.current = "";

        if (e.code !== 1000 && shouldBeListeningRef.current) {
          // Unexpected close — try reconnect
          reconnectCountRef.current++;

          const closeMsgs: Record<number, string> = {
            1006: "Network dropped",
            1008: "Auth failed",
            1011: "Deepgram server error",
          };

          if (reconnectCountRef.current > 3) {
            setError(`Deepgram keeps disconnecting (${closeMsgs[e.code] || `code ${e.code}`})`);
            setIsListening(false);
            reconnectCountRef.current = 0;
            shouldBeListeningRef.current = false;
            return;
          }

          setError(
            `${closeMsgs[e.code] || `Disconnected (code ${e.code})`} — reconnecting (${reconnectCountRef.current}/3)...`
          );

          setTimeout(() => {
            if (shouldBeListeningRef.current) {
              startStreaming();
            }
          }, 2000);
        } else {
          setIsListening(false);
        }
      };
    } catch (err) {
      setError(`Deepgram error: ${err instanceof Error ? err.message : String(err)}`);
      setIsListening(false);
    }
  }, [cleanup]);

  const start = useCallback(async () => {
    shouldBeListeningRef.current = true;
    reconnectCountRef.current = 0;
    await startStreaming();
  }, [startStreaming]);

  const stop = useCallback(() => {
    shouldBeListeningRef.current = false;
    cleanup();
    setIsListening(false);
  }, [cleanup]);

  return { isListening, error, start, stop };
}
