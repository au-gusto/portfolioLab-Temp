import type { CapacitorConfig } from "@capacitor/cli";

// App das lojas (Google Play e App Store). Empacota o site exportado em out/
// (APP=1 next build), com o Python dentro: ver lojas/README.md.
const config: CapacitorConfig = {
  appId: "br.com.portfoliolab.app",
  appName: "Portfolio Lab",
  webDir: "out",
  backgroundColor: "#E2DCD0",
};

export default config;
