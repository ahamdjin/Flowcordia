import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4211/flowcordia-studio-activepieces/",
    ...(process.platform === "win32" ? { channel: "chrome" } : {}),
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 4211",
    port: 4211,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
