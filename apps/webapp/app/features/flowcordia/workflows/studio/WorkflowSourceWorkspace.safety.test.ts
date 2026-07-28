import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Workflow source workspace safety", () => {
  it("protects browser-only edits without bypassing durable source commands", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./WorkflowSourceWorkspace.tsx", import.meta.url)),
      "utf8"
    );

    expect(source).toContain("useBlocker");
    expect(source).toContain("useBeforeUnload");
    expect(source).toContain("allowNavigationRef");
    expect(source).toContain("sourceEditorSelectionDecision");
    expect(source).toContain("isSourceEditorSaveShortcut");
    expect(source).toContain("onKeyDownCapture={handleEditorKeyDown}");
    expect(source).toContain("expectedVersion: openedSource.version");
    expect(source).toContain("operation: \"edit_source\"");
    expect(source).toContain("Discard unsaved source changes?");
    expect(source).toContain("Unsaved browser text is never sent to GitHub.");
    expect(source).not.toContain("window.confirm");
  });
});
