import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLOWCORDIA_BUNDLED_IMAGE_BINDINGS } from "../../app/features/flowcordia/operations/bundled-release";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

describe("Flowcordia immutable bundled source boundary", () => {
  it("renders the immutable image overlay last on the supported path", () => {
    const wrapper = source("docker/scripts/flowcordia-bundled.sh");
    const immutable = source("docker/flowcordia-bundled-immutable.yml");

    const externalIndex = wrapper.indexOf("docker/flowcordia-self-host.yml");
    const bundleIndex = wrapper.indexOf("docker/flowcordia-bundled.yml");
    const immutableIndex = wrapper.indexOf("docker/flowcordia-bundled-immutable.yml");
    expect(externalIndex).toBeGreaterThan(-1);
    expect(bundleIndex).toBeGreaterThan(externalIndex);
    expect(immutableIndex).toBeGreaterThan(bundleIndex);

    for (const binding of FLOWCORDIA_BUNDLED_IMAGE_BINDINGS) {
      expect(immutable).toContain(`\${${binding.environmentKey}:?`);
    }
    expect(immutable).not.toMatch(/image:\s+[^$\n]+:(?:latest|v4-beta)\s*$/m);
  });

  it("documents only digest-bound dependency examples", () => {
    const environment = source("docker/flowcordia-bundled.env.example");
    for (const binding of FLOWCORDIA_BUNDLED_IMAGE_BINDINGS) {
      const match = environment.match(new RegExp(`^${binding.environmentKey}=(.+)$`, "m"));
      expect(match, `${binding.environmentKey} must be documented`).not.toBeNull();
      expect(match![1]).toContain("@sha256:");
    }
    expect(environment).toContain("FLOWCORDIA_BUNDLED_RELEASE_MANIFEST_FILE=");
    expect(environment).toContain("FLOWCORDIA_BUNDLED_RELEASE_MANIFEST_SHA256=");
  });

  it("binds CI validation to the exact bundled manifest and immutable overlay", () => {
    const workflow = source(".github/workflows/flowcordia-bundled-self-host.yml");
    expect(workflow).toContain("scripts/flowcordia-bundled-release.ts");
    expect(workflow).toContain("--bundle-manifest /tmp/flowcordia-bundled-release-manifest.json");
    expect(workflow).toContain("docker/flowcordia-bundled-immutable.yml");
    expect(workflow).not.toContain("FLOWCORDIA_SUPERVISOR_IMAGE_REFERENCE=ghcr.io/triggerdotdev/supervisor:v4-beta\n");
  });
});
