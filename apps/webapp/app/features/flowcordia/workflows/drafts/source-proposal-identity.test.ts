import { describe, expect, it } from "vitest";
import { workflowSourceProposalId } from "./source-proposal-identity";

const base = {
  draftPublicId: "11111111-1111-4111-8111-111111111111",
  draftVersion: 7n,
  workflowSha256: "a".repeat(64),
  sourceDigest: "b".repeat(64),
};

describe("workflowSourceProposalId", () => {
  it("creates a valid deterministic proposal ID within the governed branch limit", () => {
    const first = workflowSourceProposalId(base);
    const second = workflowSourceProposalId(base);

    expect(first).toBe(second);
    expect(first).toMatch(/^studio-s-[0-9a-f]{64}$/);
    expect(first.length).toBeLessThanOrEqual(80);
  });

  it("changes when any workflow or source identity changes", () => {
    const original = workflowSourceProposalId(base);

    expect(workflowSourceProposalId({ ...base, draftVersion: 8n })).not.toBe(original);
    expect(workflowSourceProposalId({ ...base, workflowSha256: "c".repeat(64) })).not.toBe(
      original
    );
    expect(workflowSourceProposalId({ ...base, sourceDigest: "d".repeat(64) })).not.toBe(original);
  });
});
