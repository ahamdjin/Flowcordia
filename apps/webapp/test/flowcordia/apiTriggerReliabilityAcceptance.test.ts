import { describe, expect, it } from "vitest";
import { createFlowcordiaApiTriggerReliabilityEvidence } from "../../app/features/flowcordia/acceptance/api-trigger-reliability-contract";

const observation = {
  schemaVersion: "0.1" as const,
  deploymentVersion: "20260726.2",
  startedAt: "2026-07-26T01:00:00.000Z",
  completedAt: "2026-07-26T01:03:00.000Z",
  duplicateSuppression: {
    state: "READY" as const,
    originalRunId: "run_duplicate_1",
    duplicateRunId: "run_duplicate_1",
  },
  idempotencyExpiry: {
    state: "READY" as const,
    originalRunId: "run_duplicate_1",
    afterExpiryRunId: "run_duplicate_2",
    ttlSeconds: 60 as const,
  },
  queueExpiry: {
    state: "READY" as const,
    blockerRunId: "run_blocker_1",
    expiredRunId: "run_expired_1",
    expiredStatus: "EXPIRED" as const,
    ttlSeconds: 60 as const,
  },
  failedRunKeyRelease: {
    state: "READY" as const,
    firstFailureRunId: "run_failure_1",
    secondFailureRunId: "run_failure_2",
  },
};

function create(overrides: Record<string, unknown> = {}) {
  return createFlowcordiaApiTriggerReliabilityEvidence({
    repository: "ahamdjin/flowcordia",
    applicationCommitSha: "a".repeat(40),
    runId: "30190000000",
    runAttempt: 1,
    observation: { ...observation, ...overrides },
  });
}

describe("Flowcordia API trigger reliability acceptance", () => {
  it("binds all four connected reliability claims into one immutable record", () => {
    expect(create()).toMatchObject({
      state: "READY",
      duplicateSuppression: {
        originalRunId: "run_duplicate_1",
        duplicateRunId: "run_duplicate_1",
      },
      idempotencyExpiry: { afterExpiryRunId: "run_duplicate_2", ttlSeconds: 60 },
      queueExpiry: { status: "EXPIRED", ttlSeconds: 60 },
      failedRunKeyRelease: {
        firstFailureRunId: "run_failure_1",
        secondFailureRunId: "run_failure_2",
      },
    });
    expect(create().evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a duplicate request that created a second run", () => {
    expect(() =>
      create({
        duplicateSuppression: {
          state: "READY",
          originalRunId: "run_duplicate_1",
          duplicateRunId: "run_duplicate_other",
        },
      })
    ).toThrow("Duplicate suppression evidence is invalid.");
  });

  it("rejects sensitive observation fields", () => {
    expect(() => create({ idempotencyKey: "must-not-enter-evidence" })).toThrow(
      "contains forbidden field idempotencyKey"
    );
  });
});
