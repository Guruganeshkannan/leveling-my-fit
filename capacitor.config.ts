import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.fa1b9ecff7cc47eabc9295264164b6b7",
  appName: "A Lovable project",
  webDir: "dist",
  server: {
    url: "https://fa1b9ecf-f7cc-47ea-bc92-95264164b6b7.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
