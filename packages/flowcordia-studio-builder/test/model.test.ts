import { describe, expect, it } from "vitest";
import {
  dockerAuthConfig,
  environmentSlug,
  parseStudioBuildMetadata,
  safeConfigPath,
} from "../src/model.js";

describe("Studio build model", () => {
  it("accepts only native artifacts that have not already been claimed", () => {
    expect(
      parseStudioBuildMetadata({ isNativeBuild: true, artifactKey: "deployments/a.tgz" })
    ).toEqual({
      isNativeBuild: true,
      artifactKey: "deployments/a.tgz",
      buildId: undefined,
      configFilePath: undefined,
      skipPromotion: undefined,
    });
    expect(parseStudioBuildMetadata({ isNativeBuild: false, artifactKey: "a" })).toBeUndefined();
    expect(parseStudioBuildMetadata({ isNativeBuild: true })).toBeUndefined();
  });

  it("maps deployable runtime environment types", () => {
    expect(environmentSlug("DEVELOPMENT")).toBe("dev");
    expect(environmentSlug("STAGING")).toBe("staging");
    expect(environmentSlug("PRODUCTION")).toBe("prod");
    expect(environmentSlug("PREVIEW")).toBeUndefined();
  });

  it("keeps config paths inside the extracted workspace", () => {
    expect(safeConfigPath("/workspace", "config/trigger.config.ts")).toBe(
      "config/trigger.config.ts"
    );
    expect(() => safeConfigPath("/workspace", "../trigger.config.ts")).toThrow(/escapes/);
    expect(() => safeConfigPath("/workspace", "/tmp/trigger.config.ts")).toThrow(/relative/);
  });

  it("creates Docker auth without exposing the plaintext password", () => {
    const config = dockerAuthConfig("localhost:5000", "flowcordia", "secret");
    expect(config.auths["localhost:5000"].auth).toBe(
      Buffer.from("flowcordia:secret").toString("base64")
    );
    expect(JSON.stringify(config)).not.toContain('"secret"');
  });
});
