import { describe, expect, it } from "vitest";

import { findJsonCompatibilityIssue } from "../src/json-value.js";

describe("JSON compatibility", () => {
  it("accepts finite plain JSON values and shared non-circular references", () => {
    const shared = { enabled: true };
    expect(
      findJsonCompatibilityIssue({ first: shared, second: shared, values: [1, null, "ok"] })
    ).toBeNull();
  });

  it("returns the first unsupported value path", () => {
    expect(findJsonCompatibilityIssue({ nested: [{ missing: undefined }] })).toEqual({
      code: "unsupported_value",
      path: ["nested", 0, "missing"],
      valueType: "undefined",
    });
  });

  it("detects active circular references without rejecting repeated values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(findJsonCompatibilityIssue({ circular })).toEqual({
      code: "circular_reference",
      path: ["circular", "self"],
      valueType: "object",
    });
  });

  it("rejects non-plain objects", () => {
    expect(findJsonCompatibilityIssue({ createdAt: new Date(0) })).toEqual({
      code: "unsupported_value",
      path: ["createdAt"],
      valueType: "Date",
    });
  });
});
