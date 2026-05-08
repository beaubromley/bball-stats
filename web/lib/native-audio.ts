import { Capacitor, registerPlugin } from "@capacitor/core";
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

/**
 * True only inside the native iOS/Android shell. `@capacitor/core` installs
 * a `Capacitor` global on plain web pages too (web stub), so the previous
 * `"Capacitor" in window` check returned true on PC web — pushing the code
 * into the native-audio path, where AudioStream.start() throws because no
 * web implementation is registered. `Capacitor.isNativePlatform()` is the
 * supported way to distinguish native from web.
 */
export function isNativeAudioAvailable(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

export { AudioStream };
export type { AudioStreamPlugin };
