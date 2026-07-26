import { describe, expect, it } from "vitest";
import { flowcordiaRestoreDatabaseName } from "../../app/features/flowcordia/operations/database-recovery";

describe("Flowcordia restore database names", () => {
  it("preserves the nonce when a release id reaches its maximum length", () => {
    const releaseId = `r${"a".repeat(63)}`;
    const first = flowcordiaRestoreDatabaseName(releaseId, "abcdef123456");
    const second = flowcordiaRestoreDatabaseName(releaseId, "123456abcdef");

    expect(first).toHaveLength(63);
    expect(second).toHaveLength(63);
    expect(first).toMatch(/_abcdef123456$/);
    expect(second).toMatch(/_123456abcdef$/);
    expect(first).not.toBe(second);
  });

  it("keeps the existing readable name for short release ids", () => {
    expect(flowcordiaRestoreDatabaseName("release-2026.07.21", "abcdef123456")).toBe(
      "flowcordia_restore_release_2026_07_21_abcdef123456"
    );
  });
});
