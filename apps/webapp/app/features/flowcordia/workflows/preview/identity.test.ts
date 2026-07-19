import { describe, expect, it } from "vitest";
import {
  flowcordiaPreviewRunIdempotencyKey,
  flowcordiaPreviewRunIdempotencyPrefix,
  flowcordiaPreviewRunSeedMetadata,
  presentFlowcordiaPreviewRunIdentity,
  selectFlowcordiaPreviewRun,
} from "./identity";

const HEAD_SHA = "b".repeat(40);
const IDENTITY = {
  workflowId: "order_intake",
  proposalId: "proposal-order-intake",
  headSha: HEAD_SHA,
};

function metadata(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    flowcordiaTrigger: {
      ...flowcordiaPreviewRunSeedMetadata(IDENTITY),
      ...overrides,
    },
    flowcordia: {
      schemaVersion: "0.1",
      workflowId: IDENTITY.workflowId,
      nodes: {
        manual_trigger: { operation: "trigger.manual", status: "SUCCEEDED" },
      },
    },
  });
}

describe("Flowcordia preview run identity", () => {
  it("builds one bounded idempotency namespace for an exact proposal head", () => {
    const requestId = "0198a9a2-7fd1-4a16-85da-f27d07d6f8a1";

    expect(flowcordiaPreviewRunIdempotencyPrefix(IDENTITY)).toBe(
      `flowcordia-preview:${IDENTITY.workflowId}:${IDENTITY.proposalId}:${HEAD_SHA}:`
    );
    expect(flowcordiaPreviewRunIdempotencyKey(IDENTITY, requestId)).toBe(
      `flowcordia-preview:${IDENTITY.workflowId}:${IDENTITY.proposalId}:${HEAD_SHA}:${requestId}`
    );
  });

  it("reads only strict versioned seed metadata", () => {
    expect(presentFlowcordiaPreviewRunIdentity(metadata())).toEqual(IDENTITY);
    expect(presentFlowcordiaPreviewRunIdentity(metadata({ schemaVersion: "0.2" }))).toBeNull();
    expect(presentFlowcordiaPreviewRunIdentity(metadata({ unexpected: true }))).toBeNull();
    expect(presentFlowcordiaPreviewRunIdentity("not-json")).toBeNull();
    expect(presentFlowcordiaPreviewRunIdentity("x".repeat(256 * 1024 + 1))).toBeNull();
  });

  it("selects the newest run whose seed identity matches the expected proposal head", () => {
    const result = selectFlowcordiaPreviewRun(
      [
        { friendlyId: "run_unrelated", metadata: metadata({ headSha: "a".repeat(40) }) },
        { friendlyId: "run_exact", metadata: metadata() },
        { friendlyId: "run_older_exact", metadata: metadata() },
      ],
      IDENTITY
    );

    expect(result?.friendlyId).toBe("run_exact");
  });

  it("rejects invalid identities and request IDs before constructing database keys", () => {
    expect(() =>
      flowcordiaPreviewRunIdempotencyPrefix({ ...IDENTITY, proposalId: "bad:id" })
    ).toThrow("identity is invalid");
    expect(() => flowcordiaPreviewRunIdempotencyKey(IDENTITY, "not-a-uuid")).toThrow(
      "request ID is invalid"
    );
  });
});
