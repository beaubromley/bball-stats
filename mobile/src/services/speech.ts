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
    const result = event.results[0];
    if (result) {
      onResult({
        transcript: result.transcript,
        isFinal: result.isFinal,
      });
    }
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
