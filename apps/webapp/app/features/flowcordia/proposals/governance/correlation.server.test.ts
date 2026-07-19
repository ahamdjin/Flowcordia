import { describe, expect, it } from "vitest";
import { flowcordiaChildCorrelationId } from "./correlation.server";

describe("Flowcordia governance correlation IDs", () => {
  it("keeps a bounded parent readable", () => {
    expect(flowcordiaChildCorrelationId("request:abc-123", "materialize")).toBe(
      "request:abc-123:materialize"
    );
  });

  it("deterministically hashes a maximum-length request ID before adding a suffix", () => {
    const parent = "a" + "b".repeat(254);
    const first = flowcordiaChildCorrelationId(parent, "materialize");
    const second = flowcordiaChildCorrelationId(parent, "materialize");

    expect(first).toBe(second);
    expect(first).toMatch(/^request:[0-9a-f]{64}:materialize$/);
    expect(first.length).toBeLessThanOrEqual(255);
  });

  it("rejects invalid internal boundaries", () => {
    expect(() => flowcordiaChildCorrelationId("", "materialize")).toThrow(TypeError);
    expect(() => flowcordiaChildCorrelationId("request:abc", "../audit")).toThrow(TypeError);
  });
});
