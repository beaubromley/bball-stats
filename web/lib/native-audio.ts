import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

interface AudioStreamPlugin {
  start(options: { sampleRate: number }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: "onAudioData",
    listenerFunc: (event: { data: string }) => void
  ): Promise<PluginListenerHandle>;
}

const AudioStream = registerPlugin<AudioStreamPlugin>("AudioStream");

export function isNativeAudioAvailable(): boolean {
  return typeof window !== "undefined" && "Capacitor" in window;
}

export { AudioStream };
export type { AudioStreamPlugin };
