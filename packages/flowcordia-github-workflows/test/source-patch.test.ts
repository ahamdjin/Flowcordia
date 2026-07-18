import { describe, expect, it } from "vitest";
import {
  MAX_GITHUB_SOURCE_PATCH_BYTES,
  MAX_GITHUB_SOURCE_PATCH_FILES,
  validateGitHubRepositorySourcePatches,
} from "../src/repository/source-patch.js";

const SHA = "a".repeat(40);

describe("governed repository source patches", () => {
  it("accepts and deterministically sorts bounded source changes", () => {
    const result = validateGitHubRepositorySourcePatches([
      { path: "src/zeta.ts", sourceText: "export const zeta = 1;\n", expectedBlobSha: SHA },
      { path: "src/alpha.test.ts", sourceText: "export const alpha = 1;\n", expectedBlobSha: null },
    ]);

    expect(result).toEqual({
      success: true,
      patches: [
        {
          path: "src/alpha.test.ts",
          sourceText: "export const alpha = 1;\n",
          expectedBlobSha: null,
        },
        { path: "src/zeta.ts", sourceText: "export const zeta = 1;\n", expectedBlobSha: SHA },
      ],
      totalBytes: 47,
    });
  });

  it.each([
    "../src/function.ts",
    "/src/function.ts",
    "src\\function.ts",
    ".git/config.ts",
    ".github/workflows/ci.ts",
    ".flowcordia/workflows/order.ts",
    "trigger/flowcordia/order.ts",
  ])("rejects unsafe or protected path %s", (path) => {
    const result = validateGitHubRepositorySourcePatches([
      { path, sourceText: "export {};\n", expectedBlobSha: null },
    ]);

    expect(result.success).toBe(false);
  });

  it("rejects unsupported files, unknown properties, invalid SHAs, and duplicate paths", () => {
    const result = validateGitHubRepositorySourcePatches([
      { path: "src/function.py", sourceText: "pass\n", expectedBlobSha: null },
      { path: "src/function.ts", sourceText: "export {};\n", expectedBlobSha: "bad" },
      {
        path: "src/extra.ts",
        sourceText: "export {};\n",
        expectedBlobSha: null,
        repository: "other/repo",
      },
      { path: "src/Case.ts", sourceText: "export {};\n", expectedBlobSha: null },
      { path: "src/case.ts", sourceText: "export {};\n", expectedBlobSha: null },
    ]);

    expect(result).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_extension" }),
        expect.objectContaining({ code: "invalid_blob_sha" }),
        expect.objectContaining({ code: "invalid_patch" }),
        expect.objectContaining({ code: "duplicate_path" }),
      ]),
    });
  });

  it("enforces per-file and file-count bounds", () => {
    const tooLarge = validateGitHubRepositorySourcePatches([
      {
        path: "src/large.ts",
        sourceText: "x".repeat(MAX_GITHUB_SOURCE_PATCH_BYTES + 1),
        expectedBlobSha: null,
      },
    ]);
    const tooMany = validateGitHubRepositorySourcePatches(
      Array.from({ length: MAX_GITHUB_SOURCE_PATCH_FILES + 1 }, (_, index) => ({
        path: `src/function-${index}.ts`,
        sourceText: "export {};\n",
        expectedBlobSha: null,
      }))
    );

    expect(tooLarge).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ code: "file_too_large" })],
    });
    expect(tooMany).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ code: "too_many_files" })],
    });
  });
});
