import { requireNativeModule, type EventSubscription } from "expo-modules-core";

export interface AudioDataEvent {
  data: string; // base64-encoded PCM Int16 audio
}

// Lazy-load native module so the app doesn't crash if it's not compiled in
// (e.g. running a dev build without prebuild)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _module: any = null;
function getModule() {
  if (!_module) {
    _module = requireNativeModule<any>("AudioStream");
  }
  return _module;
}

export async function startAudioStream(sampleRate: number = 16000): Promise<void> {
  await getModule().start(sampleRate);
}

export function stopAudioStream(): void {
  getModule().stop();
}

export function addAudioListener(
  callback: (event: AudioDataEvent) => void
): EventSubscription {
  return getModule().addListener("onAudioData", callback);
}
