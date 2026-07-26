import { describe, expect, it } from "vitest";
import { cloneJson, jcsJsonStringify, stableJsonStringify } from "../src/index.js";

describe("Flowcordia canonical JSON foundation", () => {
  it("preserves the existing sorted pretty serialization contract", () => {
    expect(
      stableJsonStringify({ z: 1, a: { y: true, b: null } }, { space: 2, trailingNewline: true })
    ).toBe('{\n  "a": {\n    "b": null,\n    "y": true\n  },\n  "z": 1\n}\n');
  });

  it("offers an explicit JCS serializer without changing version-1 callers", () => {
    expect(jcsJsonStringify({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it("clones JSON without JSON stringify round trips", () => {
    const source = { nested: [{ value: 1 }] };
    const cloned = cloneJson(source);
    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned.nested).not.toBe(source.nested);
  });
});
