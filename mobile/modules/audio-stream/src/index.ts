import { requireNativeModule, type EventSubscription } from "expo-modules-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioStreamModule = requireNativeModule<any>("AudioStream");

export interface AudioDataEvent {
  data: string; // base64-encoded PCM Int16 audio
}

export async function startAudioStream(sampleRate: number = 16000): Promise<void> {
  await AudioStreamModule.start(sampleRate);
}

export function stopAudioStream(): void {
  AudioStreamModule.stop();
}

export function addAudioListener(
  callback: (event: AudioDataEvent) => void
): EventSubscription {
  return AudioStreamModule.addListener("onAudioData", callback);
}
