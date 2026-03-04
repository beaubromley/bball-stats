import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useCallback, useRef, useState } from "react";

export interface SpeechResult {
  transcript: string;
  isFinal: boolean;
}

export function useSpeechRecognition(onResult: (result: SpeechResult) => void) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldRestartRef = useRef(false);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const results = event.results;
    if (!results || results.length === 0) return;

    const result = results[0];
    if (!result) return;

    // expo-speech-recognition: event.isFinal indicates if this is a final result
    // Also check result-level isFinal for compatibility
    const isFinal = Boolean(
      event.isFinal ??
      (result as unknown as { isFinal?: boolean }).isFinal ??
      false
    );

    onResult({
      transcript: result.transcript,
      isFinal,
    });
  });

  useSpeechRecognitionEvent("error", (event) => {
    // "no-speech" is normal — just means silence, restart
    if (event.error !== "no-speech") {
      setError(event.message);
    }
  });

  useSpeechRecognitionEvent("end", () => {
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
    await startRecognition();
  }, [startRecognition]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { isListening, error, start, stop };
}
