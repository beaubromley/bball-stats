import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bballstats.app",
  appName: "BballStats",
  webDir: "public",
  server: {
    url: "https://bball-stats-vert.vercel.app",
    cleartext: false,
  },
};

export default config;
