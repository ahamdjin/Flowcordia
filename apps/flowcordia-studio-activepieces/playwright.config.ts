import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4211/flowcordia-studio-activepieces/",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      "rm -rf .e2e-public && mkdir -p .e2e-public/flowcordia-studio-activepieces && cp -R dist/. .e2e-public/flowcordia-studio-activepieces/ && python3 -m http.server 4211 --directory .e2e-public",
    port: 4211,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
