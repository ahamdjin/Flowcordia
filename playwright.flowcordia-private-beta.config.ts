import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/flowcordia-connected",
  testMatch: "private-beta.connected.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["line"]],
  timeout: 30 * 60 * 1_000,
  expect: { timeout: 15_000 },
  outputDir:
    process.env.FLOWCORDIA_PRIVATE_BETA_OUTPUT_DIR ?? "/tmp/flowcordia-private-beta-output",
  use: {
    baseURL: process.env.FLOWCORDIA_PRIVATE_BETA_BASE_URL ?? "https://invalid.local",
    storageState:
      process.env.FLOWCORDIA_PRIVATE_BETA_STORAGE_STATE_PATH ??
      "/tmp/flowcordia-private-beta-storage-state.json",
    acceptDownloads: false,
    ignoreHTTPSErrors: false,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
