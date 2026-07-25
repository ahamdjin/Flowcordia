import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/flowcordia-connected",
  testMatch: "production-identity.connected.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["line"]],
  timeout: 62 * 60 * 1_000,
  expect: { timeout: 15_000 },
  outputDir:
    process.env.FLOWCORDIA_PRODUCTION_IDENTITY_OUTPUT_DIR ??
    "/tmp/flowcordia-production-identity-output",
  use: {
    baseURL: process.env.FLOWCORDIA_PRODUCTION_IDENTITY_BASE_URL ?? "https://invalid.local",
    storageState:
      process.env.FLOWCORDIA_PRODUCTION_IDENTITY_STORAGE_STATE_PATH ??
      "/tmp/flowcordia-production-identity-storage-state.json",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
