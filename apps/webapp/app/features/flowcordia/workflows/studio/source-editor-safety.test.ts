import { describe, expect, it } from "vitest";
import {
  isSourceEditorSaveShortcut,
  sourceEditorSelectionDecision,
} from "./source-editor-safety";

describe("source editor safety", () => {
  it("does nothing when the current source node is selected again", () => {
    expect(
      sourceEditorSelectionDecision({ currentNodeId: "node_1", nextNodeId: "node_1", dirty: true })
    ).toBe("noop");
  });

  it("requires confirmation before a dirty source switch", () => {
    expect(
      sourceEditorSelectionDecision({ currentNodeId: "node_1", nextNodeId: "node_2", dirty: true })
    ).toBe("confirm");
  });

  it("allows a clean source switch immediately", () => {
    expect(
      sourceEditorSelectionDecision({ currentNodeId: "node_1", nextNodeId: "node_2", dirty: false })
    ).toBe("select");
  });

  it("recognizes platform save shortcuts without stealing Alt shortcuts", () => {
    expect(
      isSourceEditorSaveShortcut({ key: "s", metaKey: true, ctrlKey: false, altKey: false })
    ).toBe(true);
    expect(
      isSourceEditorSaveShortcut({ key: "S", metaKey: false, ctrlKey: true, altKey: false })
    ).toBe(true);
    expect(
      isSourceEditorSaveShortcut({ key: "s", metaKey: false, ctrlKey: false, altKey: false })
    ).toBe(false);
    expect(
      isSourceEditorSaveShortcut({ key: "s", metaKey: true, ctrlKey: false, altKey: true })
    ).toBe(false);
  });
});
