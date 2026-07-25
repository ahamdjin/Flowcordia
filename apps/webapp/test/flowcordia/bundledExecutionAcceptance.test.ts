import { describe, expect, it } from "vitest";
import { createFlowcordiaBundledExecutionEvidence } from "../../app/features/flowcordia/acceptance/bundled-execution-contract";

const sourceSha = "a".repeat(40);
const observation = {
  schemaVersion: "0.1" as const,
  startedAt: "2026-07-26T00:00:00.000Z",
  completedAt: "2026-07-26T00:10:00.000Z",
  services: {
    postgres: "READY" as const,
    redis: "READY" as const,
    electric: "READY" as const,
    clickhouse: "READY" as const,
    minio: "READY" as const,
    registry: "READY" as const,
    s2: "READY" as const,
    "docker-proxy": "READY" as const,
    web: "READY" as const,
    operations: "READY" as const,
    supervisor: "READY" as const,
  },
  cleanInstall: true as const,
  doctorReady: true as const,
  deploymentVersion: "20260726.1",
  deployedTaskCount: 1,
  supervisorWorkloadObserved: true as const,
  s2StateChanged: true as const,
  restartReady: true as const,
  teardown: {
    containersAbsent: true as const,
    networksAbsent: true as const,
    volumesAbsent: true as const,
  },
};

function createEvidence(overrides: Record<string, unknown> = {}) {
  return createFlowcordiaBundledExecutionEvidence({
    repository: "ahamdjin/flowcordia",
    runId: "30180000000",
    runAttempt: 1,
    sourceSha,
    manifest: {
      releaseId: "flowcordia-0.1.0-beta.1",
      applicationCommitSha: sourceSha,
      image: { digest: "b".repeat(64) },
    },
    observation: { ...observation, ...overrides },
    execution: {
      schemaVersion: "0.1",
      taskId: "flowcordia-beta-reference",
      friendlyId: "run_beta_reference",
      status: "COMPLETED_SUCCESSFULLY",
    },
  });
}

describe("Flowcordia bundled execution acceptance", () => {
  it("binds one clean supervisor and S2 execution to immutable release evidence", () => {
    const evidence = createEvidence();
    expect(evidence).toMatchObject({
      state: "READY",
      applicationCommitSha: sourceSha,
      installation: { clean: true, doctor: "READY", restart: "READY" },
      deployment: { taskId: "flowcordia-beta-reference", taskCount: 1 },
      execution: {
        status: "COMPLETED_SUCCESSFULLY",
        supervisorWorkloadObserved: true,
        s2StateChanged: true,
      },
      teardown: { containersAbsent: true, networksAbsent: true, volumesAbsent: true },
    });
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when S2 did not change during the verified run", () => {
    expect(() => createEvidence({ s2StateChanged: false })).toThrow(
      "The bundled execution observation is incomplete."
    );
  });

  it("rejects sensitive fields before evidence assembly", () => {
    expect(() =>
      createEvidence({ providerToken: "must-not-enter-evidence" })
    ).toThrow("contains forbidden field providerToken");
  });
});
