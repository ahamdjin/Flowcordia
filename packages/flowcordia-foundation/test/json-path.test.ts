import { describe, expect, it } from "vitest";
import { getDotPath, parseDotPath, setDotPath } from "../src/index.js";

describe("Flowcordia JSON path foundation", () => {
  it("uses bounded safe dot paths over the mature JSON Pointer implementation", () => {
    const parsed = parseDotPath("items.0.name", { allowArrayIndexes: true });
    expect(parsed).toMatchObject({ success: true, pointer: "/items/0/name" });
    expect(getDotPath({ items: [{ name: "Ada" }] }, "items.0.name")).toEqual({
      found: true,
      value: "Ada",
    });
  });

  it("rejects prototype-pollution paths", () => {
    expect(parseDotPath("safe.__proto__.value")).toEqual({ success: false, reason: "unsafe_path" });
  });

  it("sets safe target paths", () => {
    const target = {};
    setDotPath(target, "customer.name", "Ada");
    expect(target).toEqual({ customer: { name: "Ada" } });
  });
});
