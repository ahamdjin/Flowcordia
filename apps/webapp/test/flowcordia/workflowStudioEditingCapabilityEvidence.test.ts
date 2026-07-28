import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), "../..", path), "utf8");
}

describe("Flowcordia Studio editing capability evidence", () => {
  const studioReadme = readRepositoryFile(
    "apps/webapp/app/features/flowcordia/workflows/studio/README.md"
  );
  const capabilityMatrix = readRepositoryFile("flowcordia/product/capability-matrix.md");
  const edgeAcceptance = readRepositoryFile("flowcordia/testing/canvas-edge-editing.md");

  it("records the merged editing stack as delivered", () => {
    for (const evidence of [studioReadme, capabilityMatrix, edgeAcceptance]) {
      expect(evidence).toContain("native node multi-selection");
      expect(evidence).toContain("identity-only copy/paste");
      expect(evidence).toContain("durable");
    }

    expect(studioReadme).toContain("durable server-owned undo/redo");
    expect(studioReadme).toContain("onlyRenderVisibleElements");
    expect(capabilityMatrix).toContain("server-authoritative subgraph duplication");
    expect(capabilityMatrix).toContain("multi-touch pinch zoom");
    expect(edgeAcceptance).toContain("React Flow visible-element rendering");
  });

  it("does not regress to the obsolete planned-capability claims", () => {
    expect(studioReadme).not.toContain(
      "Copy/paste, undo/redo, automatic layout, multi-selection commands"
    );
    expect(studioReadme).not.toContain("Unsupported history, copy/paste");
    expect(capabilityMatrix).not.toContain(
      "copy/paste, undo/redo, automatic layout, viewport virtualization"
    );
    expect(edgeAcceptance).not.toContain(
      "arbitrary source retargeting, copy/paste, undo/redo, automatic layout"
    );
  });

  it("keeps unmeasured and intentionally unsupported work explicit", () => {
    for (const evidence of [studioReadme, capabilityMatrix, edgeAcceptance]) {
      expect(evidence).toContain("automatic layout");
      expect(evidence).toContain("measured");
    }

    expect(capabilityMatrix).toContain("measured assistive-technology acceptance");
    expect(capabilityMatrix).toContain("measured large-graph browser performance");
    expect(edgeAcceptance).toContain("multi-edge selection");
    expect(edgeAcceptance).toContain("arbitrary source retargeting");
  });
});
