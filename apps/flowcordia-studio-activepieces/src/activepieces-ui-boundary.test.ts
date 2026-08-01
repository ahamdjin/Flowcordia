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
});
