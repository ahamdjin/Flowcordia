import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./flowcordia/acceptance",
  testMatch: "clean-install-onboarding.spec.ts",
  timeout: 30 * 60 * 1000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  outputDir: process.env.FLOWCORDIA_ACCEPTANCE_BROWSER_OUTPUT_DIR,
  use: {
    baseURL: process.env.FLOWCORDIA_ACCEPTANCE_BASE_URL,
    browserName: "chromium",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
