import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bballstats.app",
  appName: "YBA Stats",
  webDir: "public",
  server: {
    url: "https://bball-stats-vert.vercel.app",
    cleartext: false,
  },
  ios: {
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  plugins: {
    WebView: {
      allowsBackForwardNavigationGestures: true,
    },
  },
};

export default config;
