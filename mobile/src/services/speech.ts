import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useCallback, useRef, useState } from "react";

export interface SpeechResult {
  transcript: string;
  isFinal: boolean;
}

/**
 * Apple Speech engine via expo-speech-recognition.
 *
 * Uses a debounce approach for "final" detection: if no new text arrives
 * within SILENCE_MS, the accumulated transcript is emitted as final.
 * This fixes the iOS issue where isFinal may never fire during continuous
 * recognition until the session ends.
 */
const SILENCE_MS = 1500;

export function useSpeechRecognition(onResult: (result: SpeechResult) => void) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldRestartRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Debounce state for silence-based finalization
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedTextRef = useRef("");

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const emitFinal = useCallback((text: string) => {
    if (!text.trim()) return;
    console.log("[Speech] emitFinal:", text.trim());
    accumulatedTextRef.current = "";
    clearSilenceTimer();
    onResultRef.current({ transcript: text.trim(), isFinal: true });
  }, [clearSilenceTimer]);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      // Silence detected — emit accumulated text as final
      if (accumulatedTextRef.current.trim()) {
        emitFinal(accumulatedTextRef.current);
      }
    }, SILENCE_MS);
  }, [clearSilenceTimer, emitFinal]);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setError(null);
    accumulatedTextRef.current = "";
  });

  useSpeechRecognitionEvent("result", (event) => {
    console.log("[Speech] result event, isFinal:", event.isFinal, "results:", event.results?.length);
    const results = event.results;
    if (!results || results.length === 0) {
      console.log("[Speech] No results array");
      return;
    }

    const result = results[0];
    if (!result || !result.transcript) {
      console.log("[Speech] Empty transcript in result[0]");
      return;
    }

    const text = result.transcript;
    const isFinal = Boolean(event.isFinal);

    console.log(`[Speech] "${text}" isFinal=${isFinal}`);

    if (isFinal) {
      // Native engine says this is final — emit immediately
      emitFinal(text);
    } else {
      // Interim result — show in real-time, accumulate, restart silence timer
      accumulatedTextRef.current = text;
      onResultRef.current({ transcript: text, isFinal: false });
      startSilenceTimer();
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (event.error !== "no-speech") {
      setError(event.message);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    // Emit any remaining accumulated text before stopping
    if (accumulatedTextRef.current.trim()) {
      emitFinal(accumulatedTextRef.current);
    }

    setIsListening(false);
    // Auto-restart if we're supposed to be listening
    if (shouldRestartRef.current) {
      setTimeout(() => {
        startRecognition();
      }, 300);
    }
  });

  const startRecognition = useCallback(async () => {
    const { granted } =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError("Microphone permission denied");
      return;
    }

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      continuous: true,
      interimResults: true,
    });
  }, []);

  const start = useCallback(async () => {
    shouldRestartRef.current = true;
    accumulatedTextRef.current = "";
    clearSilenceTimer();
    await startRecognition();
  }, [startRecognition, clearSilenceTimer]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    clearSilenceTimer();
    // Emit any remaining text
    if (accumulatedTextRef.current.trim()) {
      emitFinal(accumulatedTextRef.current);
    }
    ExpoSpeechRecognitionModule.stop();
  }, [clearSilenceTimer, emitFinal]);

  return { isListening, error, start, stop };
}
