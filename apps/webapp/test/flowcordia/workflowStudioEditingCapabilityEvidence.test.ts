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
  const accessibilityAcceptance = readRepositoryFile(
    "flowcordia/runbooks/canvas-accessibility-acceptance.md"
  );

  it("records the merged editing stack as delivered", () => {
    expect(studioReadme).toContain("native multi-selection");
    expect(capabilityMatrix).toContain("native node multi-selection");
    expect(edgeAcceptance).toContain("native node multi-selection");

    for (const evidence of [studioReadme, capabilityMatrix, edgeAcceptance]) {
      expect(evidence).toContain("identity-only copy/paste");
      expect(evidence).toContain("durable");
      expect(evidence).toContain("automatic layout");
    }

    expect(studioReadme).toContain("durable server-owned undo/redo");
    expect(studioReadme).toContain("onlyRenderVisibleElements");
    expect(studioReadme).toContain("up to 500 finite node positions");
    expect(capabilityMatrix).toContain("server-authoritative subgraph duplication");
    expect(capabilityMatrix).toContain("explicit pinned-ELK left-to-right automatic layout");
    expect(capabilityMatrix).toContain("real 300-node ELK layout contract");
    expect(edgeAcceptance).toContain("explicit pinned-ELK automatic layout");
    expect(edgeAcceptance).toContain("React Flow visible-element rendering");
    expect(accessibilityAcceptance).toContain("one explicit `Arrange workflow` action");
    expect(accessibilityAcceptance).toContain(
      "real ELK returns finite grid-aligned positions for 300 nodes"
    );
  });

  it("does not regress to obsolete planned-capability claims", () => {
    expect(studioReadme).not.toContain(
      "Copy/paste, undo/redo, automatic layout, multi-selection commands"
    );
    expect(studioReadme).not.toContain("Unsupported history, copy/paste");
    expect(capabilityMatrix).not.toContain(
      "copy/paste, undo/redo, automatic layout, viewport virtualization"
    );
    expect(capabilityMatrix).not.toContain("automatic layout, multi-edge selection");
    expect(edgeAcceptance).not.toContain(
      "arbitrary source retargeting, copy/paste, undo/redo, automatic layout"
    );
    expect(accessibilityAcceptance).not.toContain(
      "This acceptance does not approve edge selection/editing, copy/paste, undo/redo, automatic layout"
    );
  });

  it("keeps empirical and intentionally unsupported work explicit", () => {
    for (const evidence of [
      studioReadme,
      capabilityMatrix,
      edgeAcceptance,
      accessibilityAcceptance,
    ]) {
      expect(evidence.toLowerCase()).toContain("measured");
    }

    expect(capabilityMatrix).toContain("measured assistive-technology acceptance");
    expect(capabilityMatrix).toContain("measured large-graph browser performance");
    expect(accessibilityAcceptance).toContain(
      "They do not substitute for the browser measurements above."
    );
    expect(edgeAcceptance).toContain("multi-edge selection");
    expect(edgeAcceptance).toContain("arbitrary source retargeting");
  });
});
