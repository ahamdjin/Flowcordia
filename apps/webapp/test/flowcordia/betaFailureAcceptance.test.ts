import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/features/flowcordia/operations/self-host-lifecycle", async () => {
  const actual = await vi.importActual<
    typeof import("../../app/features/flowcordia/operations/self-host-lifecycle")
  >("../../app/features/flowcordia/operations/self-host-lifecycle");
  return {
    ...actual,
    parseFlowcordiaSelfHostLifecycleEvidence: vi.fn((value: unknown) => value),
  };
});

import {
  createFlowcordiaBetaFailureEvidence,
  type FlowcordiaBetaFailureObservation,
} from "../../app/features/flowcordia/acceptance/beta-failure-contract";
import { parseFlowcordiaSelfHostLifecycleEvidence } from "../../app/features/flowcordia/operations/self-host-lifecycle";

const APPLICATION_SHA = "1123456789abcdef0123456789abcdef01234567";
const DIGEST = "a".repeat(64);

function lifecycle() {
  return {
    schemaVersion: "0.1",
    kind: "flowcordia-self-host-lifecycle",
    state: "READY",
    checkedAt: "2026-07-26T02:00:00.000Z",
    target: {
      releaseId: "flowcordia-beta-0.1.0",
      applicationCommitSha: APPLICATION_SHA,
      imageDigest: DIGEST,
    },
    recovery: {
      backupManifestSha256: "b".repeat(64),
      restoreEvidenceSha256: "c".repeat(64),
    },
    rollback: { mode: "restore_required" },
    source: { runId: "30000000001" },
    evidenceSha256: "d".repeat(64),
  };
}

function observation(): FlowcordiaBetaFailureObservation {
  return {
    schemaVersion: "0.1",
    startedAt: "2026-07-26T03:00:00.000Z",
    completedAt: "2026-07-26T03:20:00.000Z",
    load: {
      submitted: 24,
      completed: 24,
      failed: 0,
      peakInFlight: 24,
      p95TriggerMilliseconds: 450,
    },
    queueSaturation: {
      blockerRunId: "run_blocker_123",
      submitted: 8,
      expired: 8,
      terminalStatus: "EXPIRED",
      recoveredRunId: "run_recovery_456",
      recoveryStatus: "COMPLETED_SUCCESSFULLY",
    },
    workerLoss: {
      deliveryId: "delivery_worker_123",
      lostLeaseAttempt: 1,
      reclaimedAttempt: 2,
      terminalStatus: "SENT",
    },
    providerOutage: {
      deliveryId: "delivery_provider_123",
      firstStatus: "PENDING",
      firstFailureCode: "PROVIDER_REJECTED",
      recoveryStatus: "SENT",
      attempts: 2,
      stableDeliveryId: true,
    },
    postFailureDiagnostics: "READY",
    teardown: {
      containersAbsent: true,
      networksAbsent: true,
      volumesAbsent: true,
    },
  };
}

function create(input: {
  observation?: FlowcordiaBetaFailureObservation;
  lifecycle?: ReturnType<typeof lifecycle>;
}) {
  return createFlowcordiaBetaFailureEvidence({
    repository: "ahamdjin/flowcordia",
    runId: "30000000002",
    runAttempt: 1,
    sourceSha: APPLICATION_SHA,
    observation: input.observation ?? observation(),
    lifecycle: input.lifecycle ?? lifecycle(),
  });
}

describe("Flowcordia Beta failure acceptance", () => {
  beforeEach(() => {
    vi.mocked(parseFlowcordiaSelfHostLifecycleEvidence).mockImplementation(
      (value) => value as never
    );
  });

  it("binds load, saturation, worker loss, provider recovery, teardown, and lifecycle recovery", () => {
    const evidence = create({});
    expect(evidence).toMatchObject({
      schemaVersion: "0.1",
      kind: "flowcordia-beta-failure-campaign",
      state: "READY",
      applicationCommitSha: APPLICATION_SHA,
      releaseId: "flowcordia-beta-0.1.0",
      load: { submitted: 24, completed: 24, failed: 0 },
      queueSaturation: { submitted: 8, expired: 8, terminalStatus: "EXPIRED" },
      workerLoss: { lostLeaseAttempt: 1, reclaimedAttempt: 2, terminalStatus: "SENT" },
      providerOutage: {
        firstStatus: "PENDING",
        firstFailureCode: "PROVIDER_REJECTED",
        recoveryStatus: "SENT",
        attempts: 2,
        stableDeliveryId: true,
      },
      disasterRecovery: {
        lifecycleRunId: "30000000001",
        lifecycleEvidenceSha256: "d".repeat(64),
        backupManifestSha256: "b".repeat(64),
        restoreEvidenceSha256: "c".repeat(64),
        rollbackMode: "restore_required",
      },
      postFailureDiagnostics: "READY",
      teardown: { containersAbsent: true, networksAbsent: true, volumesAbsent: true },
    });
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects incomplete load and queue saturation proof", () => {
    const failedLoad = observation();
    failedLoad.load.completed = 23;
    failedLoad.load.failed = 1;
    expect(() => create({ observation: failedLoad })).toThrow(/load observation/i);

    const partialExpiry = observation();
    partialExpiry.queueSaturation.expired = 7;
    expect(() => create({ observation: partialExpiry })).toThrow(/saturation and recovery/i);
  });

  it("rejects missing lease reclamation and provider redrive", () => {
    const lostOwnership = observation();
    lostOwnership.workerLoss.reclaimedAttempt = 1;
    expect(() => create({ observation: lostOwnership })).toThrow(/worker loss/i);

    const noRecovery = observation();
    noRecovery.providerOutage.recoveryStatus = "SENT";
    noRecovery.providerOutage.attempts = 3;
    expect(() => create({ observation: noRecovery })).toThrow(/outage redrive/i);
  });

  it("rejects mixed lineage, invalid chronology, and sensitive evidence fields", () => {
    const mixed = lifecycle();
    mixed.target.applicationCommitSha = "2123456789abcdef0123456789abcdef01234567";
    expect(() => create({ lifecycle: mixed })).toThrow(/one application commit/i);

    const early = observation();
    early.startedAt = "2026-07-26T01:00:00.000Z";
    early.completedAt = "2026-07-26T01:20:00.000Z";
    expect(() => create({ observation: early })).toThrow(/after the candidate lifecycle/i);

    const sensitive = observation() as FlowcordiaBetaFailureObservation & { payload: string };
    sensitive.payload = "must-not-enter-evidence";
    expect(() => create({ observation: sensitive })).toThrow(/forbidden field payload/i);
  });
});
