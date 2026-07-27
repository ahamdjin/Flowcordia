import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type TurboConfiguration = {
  $schema?: unknown;
  pipeline?: unknown;
  tasks?: unknown;
  globalEnv?: unknown;
};

const turboConfiguration = JSON.parse(
  readFileSync(new URL("../../../../turbo.json", import.meta.url), "utf8")
) as TurboConfiguration;

describe("Turbo repository environment contract", () => {
  it("uses the Turbo 2 task schema", () => {
    expect(turboConfiguration.$schema).toBe("https://turbo.build/schema.json");
    expect(turboConfiguration).not.toHaveProperty("pipeline");
    expect(turboConfiguration.tasks).toEqual(expect.any(Object));
  });

  it("forwards the complete server-managed GitHub App configuration", () => {
    expect(turboConfiguration.globalEnv).toEqual(
      expect.arrayContaining([
        "GITHUB_APP_ENABLED",
        "GITHUB_APP_ID",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_APP_WEBHOOK_SECRET",
        "GITHUB_APP_SLUG",
      ])
    );
  });
});
