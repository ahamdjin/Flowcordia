import { describe, expect, it } from "vitest";
import { resolveWorkflowStudioHistoryShortcut } from "./history-shortcuts";

describe("Workflow Studio history shortcuts", () => {
  it("maps platform undo and redo combinations", () => {
    expect(
      resolveWorkflowStudioHistoryShortcut({
        key: "z",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      })
    ).toBe("undo");
    expect(
      resolveWorkflowStudioHistoryShortcut({
        key: "Z",
        metaKey: false,
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
      })
    ).toBe("redo");
    expect(
      resolveWorkflowStudioHistoryShortcut({
        key: "y",
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
      })
    ).toBe("redo");
  });

  it("ignores unrelated and Alt-modified shortcuts", () => {
    expect(
      resolveWorkflowStudioHistoryShortcut({
        key: "z",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      })
    ).toBeNull();
    expect(
      resolveWorkflowStudioHistoryShortcut({
        key: "z",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
      })
    ).toBeNull();
  });
});
