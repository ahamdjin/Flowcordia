import { describe, expect, it } from "vitest";
import {
  hasInvalidStudioV2View,
  normalizeStudioV2ViewSearchParams,
  resolveStudioV2View,
  studioV2SearchParamsForView,
} from "./view-state";

describe("Studio V2 view state", () => {
  it("treats invalid view values as Editor and canonicalizes the URL", () => {
    const searchParams = new URLSearchParams("view=preview&node=abc");

    expect(resolveStudioV2View(searchParams)).toBe("editor");
    expect(hasInvalidStudioV2View(searchParams)).toBe(true);
    expect(normalizeStudioV2ViewSearchParams(searchParams).toString()).toBe("node=abc");
  });

  it("supports Editor to Source to Editor history-friendly URL transitions", () => {
    const editor = new URLSearchParams("node=abc");
    const source = studioV2SearchParamsForView(editor, "source");
    const editorAgain = studioV2SearchParamsForView(source, "editor");

    expect(resolveStudioV2View(editor)).toBe("editor");
    expect(source.get("view")).toBe("source");
    expect(resolveStudioV2View(source)).toBe("source");
    expect(editorAgain.toString()).toBe("node=abc");
    expect(resolveStudioV2View(editorAgain)).toBe("editor");
  });
});
