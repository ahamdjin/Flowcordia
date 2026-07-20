import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/flowcordia-connected",
  testMatch: "promotion.connected.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["line"]],
  timeout: 10 * 60 * 1_000,
  expect: { timeout: 15_000 },
  outputDir: process.env.FLOWCORDIA_PROMOTION_OUTPUT_DIR ?? "/tmp/flowcordia-promotion-output",
  use: {
    baseURL: process.env.FLOWCORDIA_PROMOTION_BASE_URL ?? "https://invalid.local",
    storageState:
      process.env.FLOWCORDIA_PROMOTION_STORAGE_STATE_PATH ??
      "/tmp/flowcordia-promotion-storage-state.json",
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
