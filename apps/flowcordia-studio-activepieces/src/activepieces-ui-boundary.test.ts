import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

describe("Activepieces owns the Studio V2 UI", () => {
  it("renders BuilderPage and forbids Flowcordia visual replacements", () => {
    const host = read("apps/flowcordia-studio-activepieces/src/studio-host.tsx");
    const vite = read("apps/flowcordia-studio-activepieces/vite.config.mts");

    expect(host).toContain('import { BuilderPage } from "@/app/builder"');
    expect(host).toContain("<BuilderPage />");
    expect(vite).not.toContain('find: "@/app/builder/pieces-selector"');
    expect(vite).not.toContain("flowcordiaCanvasBoundary");

    for (const path of [
      "apps/flowcordia-studio-activepieces/src/flowcordia-canvas.tsx",
      "apps/flowcordia-studio-activepieces/src/flowcordia-piece-selector.tsx",
      "apps/flowcordia-studio-activepieces/src/studio-host.css",
      "apps/flowcordia-studio-activepieces/src/studio-view-switch.css",
      "apps/flowcordia-studio-activepieces/src/workflow-code-view.tsx",
      "apps/flowcordia-studio-activepieces/src/workflow-code-view.css",
      "apps/flowcordia-studio-activepieces/src/workflow-code.ts",
      "apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2ReleaseControls.tsx",
    ]) {
      expect(existsSync(resolve(repositoryRoot, path)), path).toBe(false);
    }
  });

  it("excludes Activepieces enterprise code from the open-source distribution", () => {
    const vite = read("apps/flowcordia-studio-activepieces/vite.config.mts");
    const dockerfile = read("docker/Dockerfile");
    const events = read("apps/flowcordia-studio-activepieces/src/activepieces-client-events.ts");

    expect(vite).toContain('replacement: path.join(appRoot, "src/activepieces-client-events.ts")');
    expect(vite).not.toContain('path.join(packages, "ee/embed-sdk/src")');
    expect(dockerfile).not.toContain("packages/ee/embed-sdk");
    expect(
      existsSync(
        resolve(
          repositoryRoot,
          "studio-v2/activepieces-core-nodes/packages/ee/embed-sdk/src/index.ts"
        )
      )
    ).toBe(false);
    expect(events).toContain("This module deliberately excludes Activepieces' enterprise");
    expect(events).not.toContain("class ActivepiecesEmbedded");
  });
});
