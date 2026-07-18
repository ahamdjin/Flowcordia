import { describe, expect, it } from "vitest";
import { canonicalSourcePatchIdentity } from "./source-patch-identity";

const first = {
  path: "src/functions/a.ts",
  sourceText: "export const a = true;\n",
  expectedBlobSha: "a".repeat(40),
};
const second = {
  path: "src/functions/b.ts",
  sourceText: "export const b = true;\n",
  expectedBlobSha: "b".repeat(40),
};

describe("canonicalSourcePatchIdentity", () => {
  it("sorts patches before creating a deterministic full-content digest", () => {
    const left = canonicalSourcePatchIdentity([second, first]);
    const right = canonicalSourcePatchIdentity([first, second]);

    expect(left.digest).toBe(right.digest);
    expect(left.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(left.patches.map((patch) => patch.path)).toEqual([
      "src/functions/a.ts",
      "src/functions/b.ts",
    ]);
  });

  it("changes when source content or expected blob identity changes", () => {
    const original = canonicalSourcePatchIdentity([first]).digest;

    expect(
      canonicalSourcePatchIdentity([{ ...first, sourceText: "export const a = false;\n" }])
        .digest
    ).not.toBe(original);
    expect(
      canonicalSourcePatchIdentity([{ ...first, expectedBlobSha: "c".repeat(40) }]).digest
    ).not.toBe(original);
  });

  it("rejects unsafe patches instead of hashing them", () => {
    expect(() =>
      canonicalSourcePatchIdentity([
        { path: "../escape.ts", sourceText: "export {};\n", expectedBlobSha: null },
      ])
    ).toThrow("path");
  });
});
