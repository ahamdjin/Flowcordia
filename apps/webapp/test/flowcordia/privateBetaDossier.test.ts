import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createFlowcordiaPrivateBetaDossier,
  FLOWCORDIA_PRIVATE_BETA_SOURCE_CONFIG,
  type FlowcordiaPrivateBetaSourceInput,
  type FlowcordiaPrivateBetaSourceStage,
} from "../../app/features/flowcordia/acceptance/private-beta-dossier";

const APPLICATION_SHA = "1123456789abcdef0123456789abcdef01234567";
const RELEASE_ID = "flowcordia-beta-0.1.0";
const WORKFLOW_ID = "private_beta_reference";
const REPOSITORY = "ahamdjin/flowcordia";
const DIGEST = "a".repeat(64);

const runIds: Record<FlowcordiaPrivateBetaSourceStage, string> = {
  launch_dossier: "30190000001",
  bundled_execution: "30190000002",
  api_reliability: "30190000003",
  promotion_recovery: "30190000004",
  failure_campaign: "30190000005",
  canvas_manual: "30190000006",
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function digestField(stage: FlowcordiaPrivateBetaSourceStage) {
  return stage === "launch_dossier" ? "manifestSha256" : "evidenceSha256";
}

function seal(
  stage: FlowcordiaPrivateBetaSourceStage,
  evidence: Record<string, unknown>
): Record<string, unknown> {
  const field = digestField(stage);
  const unsigned = { ...evidence };
  delete unsigned[field];
  return { ...unsigned, [field]: digest(unsigned) };
}

function reseal(source: FlowcordiaPrivateBetaSourceInput): void {
  source.evidence = seal(source.stage, source.evidence as Record<string, unknown>);
}

function artifactName(stage: FlowcordiaPrivateBetaSourceStage, runAttempt = 1): string {
  const runId = runIds[stage];
  switch (stage) {
    case "launch_dossier":
      return `flowcordia-release-manifest-${RELEASE_ID}-${runId}`;
    case "bundled_execution":
      return `flowcordia-bundled-execution-${runId}-${runAttempt}`;
    case "api_reliability":
      return `flowcordia-api-trigger-reliability-${runId}-${runAttempt}`;
    case "promotion_recovery":
      return `flowcordia-beta-promotion-recovery-${RELEASE_ID}-${runId}`;
    case "failure_campaign":
      return `flowcordia-beta-failure-${runId}-${runAttempt}`;
    case "canvas_manual":
      return `flowcordia-canvas-manual-${runId}-${runAttempt}`;
  }
}

function evidence(stage: FlowcordiaPrivateBetaSourceStage): Record<string, unknown> {
  switch (stage) {
    case "launch_dossier":
      return {
        schemaVersion: "0.5",
        releaseId: RELEASE_ID,
        applicationCommitSha: APPLICATION_SHA,
        workflowId: WORKFLOW_ID,
        sourceRuns: Array.from({ length: 9 }, (_, index) => ({
          stage: `stage_${index}`,
          runId: String(40100000000 + index),
          workflowCommitSha: APPLICATION_SHA,
        })),
        selfHost: {
          targetReleaseId: RELEASE_ID,
          targetApplicationCommitSha: APPLICATION_SHA,
        },
        assembledAt: "2026-07-26T09:00:00.000Z",
      };
    case "bundled_execution":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-bundled-execution",
        state: "READY",
        repository: REPOSITORY,
        releaseId: RELEASE_ID,
        applicationCommitSha: APPLICATION_SHA,
        imageDigest: "b".repeat(64),
        workflow: { runId: runIds[stage], runAttempt: 1, sourceSha: APPLICATION_SHA },
        installation: { clean: true, serviceCount: 11, doctor: "READY", restart: "READY" },
        deployment: {
          version: "deployment-bundled",
          taskId: "flowcordia-beta-reference",
          taskCount: 1,
        },
        execution: {
          friendlyId: "run-bundled",
          status: "COMPLETED_SUCCESSFULLY",
          supervisorWorkloadObserved: true,
          s2StateChanged: true,
        },
        teardown: { containersAbsent: true, networksAbsent: true, volumesAbsent: true },
        startedAt: "2026-07-26T09:01:00.000Z",
        completedAt: "2026-07-26T09:10:00.000Z",
      };
    case "api_reliability":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-api-trigger-reliability",
        state: "READY",
        repository: REPOSITORY,
        applicationCommitSha: APPLICATION_SHA,
        workflow: { runId: runIds[stage], runAttempt: 1 },
        deploymentVersion: "deployment-api",
        duplicateSuppression: { originalRunId: "run_original", duplicateRunId: "run_original" },
        idempotencyExpiry: {
          originalRunId: "run_original",
          afterExpiryRunId: "run_after_expiry",
          ttlSeconds: 60,
        },
        queueExpiry: {
          blockerRunId: "run_blocker",
          expiredRunId: "run_expired",
          status: "EXPIRED",
          ttlSeconds: 60,
        },
        failedRunKeyRelease: {
          firstFailureRunId: "run_failure_one",
          secondFailureRunId: "run_failure_two",
        },
        startedAt: "2026-07-26T09:11:00.000Z",
        completedAt: "2026-07-26T09:20:00.000Z",
      };
    case "promotion_recovery":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-beta-promotion-recovery",
        state: "READY",
        releaseId: RELEASE_ID,
        applicationCommitSha: APPLICATION_SHA,
        workflowId: WORKFLOW_ID,
        lifecycle: {
          targetReleaseId: RELEASE_ID,
          targetImageDigest: "c".repeat(64),
          backupManifestSha256: "d".repeat(64),
          restoreEvidenceSha256: "e".repeat(64),
          archiveSha256: "f".repeat(64),
          rollbackMode: "application_rollback",
          recoveryRequired: false,
          lifecycleEvidenceSha256: "1".repeat(64),
        },
        production: {
          proposalId: "proposal-production",
          mergeCommitSha: "2123456789abcdef0123456789abcdef01234567",
          deploymentVersion: "deployment-production",
          runFriendlyId: "run-production",
          completedAt: "2026-07-26T09:25:00.000Z",
        },
        rollbackProduction: {
          proposalId: "proposal-rollback",
          mergeCommitSha: "3123456789abcdef0123456789abcdef01234567",
          deploymentVersion: "deployment-rollback",
          runFriendlyId: "run-rollback",
          completedAt: "2026-07-26T09:29:00.000Z",
        },
        chronology: {
          lifecycleCheckedAt: "2026-07-26T09:21:00.000Z",
          productionStartedAt: "2026-07-26T09:22:00.000Z",
          productionCompletedAt: "2026-07-26T09:25:00.000Z",
          rollbackStartedAt: "2026-07-26T09:26:00.000Z",
          rollbackCompletedAt: "2026-07-26T09:29:00.000Z",
        },
        sources: [
          {
            stage: "self_host_lifecycle",
            runId: "50100000001",
            runAttempt: 1,
            workflowPath: ".github/workflows/flowcordia-self-host-lifecycle.yml",
            workflowCommitSha: APPLICATION_SHA,
            artifactName: "flowcordia-self-host-lifecycle-50100000001-1",
            artifactArchiveSha256: "2".repeat(64),
            evidenceSha256: "3".repeat(64),
          },
          {
            stage: "production",
            runId: "50100000002",
            runAttempt: 1,
            workflowPath: ".github/workflows/flowcordia-production-acceptance.yml",
            workflowCommitSha: APPLICATION_SHA,
            artifactName: "flowcordia-production-reference-50100000002",
            artifactArchiveSha256: "4".repeat(64),
            evidenceSha256: "5".repeat(64),
          },
          {
            stage: "rollback_production",
            runId: "50100000003",
            runAttempt: 1,
            workflowPath: ".github/workflows/flowcordia-production-acceptance.yml",
            workflowCommitSha: APPLICATION_SHA,
            artifactName: "flowcordia-rollback-production-reference-50100000003",
            artifactArchiveSha256: "6".repeat(64),
            evidenceSha256: "7".repeat(64),
          },
        ],
        checkedAt: "2026-07-26T09:30:00.000Z",
      };
    case "failure_campaign":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-beta-failure-campaign",
        state: "READY",
        repository: REPOSITORY,
        releaseId: RELEASE_ID,
        applicationCommitSha: APPLICATION_SHA,
        imageDigest: "8".repeat(64),
        workflow: { runId: runIds[stage], runAttempt: 1, sourceSha: APPLICATION_SHA },
        load: {
          submitted: 24,
          completed: 24,
          failed: 0,
          peakInFlight: 12,
          p95TriggerMilliseconds: 450,
        },
        queueSaturation: {
          blockerRunId: "run_queue_blocker",
          submitted: 8,
          expired: 8,
          terminalStatus: "EXPIRED",
          recoveredRunId: "run_queue_recovered",
          recoveryStatus: "COMPLETED_SUCCESSFULLY",
        },
        workerLoss: {
          deliveryId: "delivery-worker-loss",
          lostLeaseAttempt: 1,
          reclaimedAttempt: 2,
          terminalStatus: "SENT",
        },
        providerOutage: {
          deliveryId: "delivery-provider-outage",
          firstStatus: "PENDING",
          firstFailureCode: "PROVIDER_REJECTED",
          recoveryStatus: "SENT",
          attempts: 2,
          stableDeliveryId: true,
        },
        disasterRecovery: {
          lifecycleRunId: "50100000001",
          lifecycleEvidenceSha256: "9".repeat(64),
          backupManifestSha256: "a".repeat(64),
          restoreEvidenceSha256: "b".repeat(64),
          rollbackMode: "application_rollback",
        },
        postFailureDiagnostics: "READY",
        teardown: { containersAbsent: true, networksAbsent: true, volumesAbsent: true },
        startedAt: "2026-07-26T09:31:00.000Z",
        completedAt: "2026-07-26T09:40:00.000Z",
      };
    case "canvas_manual":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-canvas-manual-acceptance",
        state: "READY",
        applicationCommitSha: APPLICATION_SHA,
        referenceRepository: "ahamdjin/flowcordia-beta-reference",
        referenceCommitSha: "4123456789abcdef0123456789abcdef01234567",
        startedAt: "2026-07-26T09:41:00.000Z",
        completedAt: "2026-07-26T09:50:00.000Z",
        source: {
          repository: REPOSITORY,
          workflowPath: ".github/workflows/flowcordia-canvas-manual-acceptance.yml",
          runId: runIds[stage],
          runAttempt: 1,
        },
        sessions: [
          { id: "nvda_chrome_windows", checks: [{ key: "canvas_region", state: "PASSED" }] },
          { id: "nvda_firefox_windows", checks: [{ key: "canvas_region", state: "PASSED" }] },
          { id: "voiceover_safari_macos", checks: [{ key: "canvas_region", state: "PASSED" }] },
        ],
        viewports: [
          { id: "desktop_1280x720", checks: [{ key: "controls_visible", state: "PASSED" }] },
          {
            id: "tablet_landscape_1024x768",
            checks: [{ key: "controls_visible", state: "PASSED" }],
          },
          {
            id: "tablet_portrait_768x1024",
            checks: [{ key: "controls_visible", state: "PASSED" }],
          },
          { id: "phone_390x844", checks: [{ key: "controls_visible", state: "PASSED" }] },
        ],
        measurements: [
          {
            graph: "production_70",
            browserCrash: false,
            freeze: false,
            lostEdits: 0,
            announcementsOrdered: true,
          },
          {
            graph: "stress_300",
            browserCrash: false,
            freeze: false,
            lostEdits: 0,
            announcementsOrdered: true,
          },
        ],
        limitations: {
          multiTouchPinchAdvertised: false,
          unlimitedGraphScaleAdvertised: false,
          virtualizationAdvertised: false,
        },
        sensitiveDataRecorded: false,
      };
  }
}

function sources(): FlowcordiaPrivateBetaSourceInput[] {
  return (Object.keys(FLOWCORDIA_PRIVATE_BETA_SOURCE_CONFIG) as FlowcordiaPrivateBetaSourceStage[]).map(
    (stage) => ({
      stage,
      runId: runIds[stage],
      runAttempt: 1,
      workflowPath: FLOWCORDIA_PRIVATE_BETA_SOURCE_CONFIG[stage].workflowPath,
      workflowCommitSha: APPLICATION_SHA,
      artifactName: artifactName(stage),
      artifactArchiveSha256: DIGEST,
      rawEvidenceSha256: "9".repeat(64),
      evidence: seal(stage, evidence(stage)),
    })
  );
}

function create(sourceInputs = sources(), assembledAt = "2026-07-26T10:00:00.000Z") {
  return createFlowcordiaPrivateBetaDossier({
    releaseId: RELEASE_ID,
    applicationCommitSha: APPLICATION_SHA,
    workflowId: WORKFLOW_ID,
    repository: REPOSITORY,
    assembledAt,
    assemblerRunId: "30190000007",
    assemblerRunAttempt: 1,
    sources: sourceInputs,
  });
}

describe("Flowcordia Private Beta dossier", () => {
  it("assembles six exact protected artifacts into one bounded READY dossier", () => {
    const dossier = create();
    expect(dossier).toMatchObject({
      schemaVersion: "0.1",
      kind: "flowcordia-private-beta-dossier",
      state: "READY",
      maturity: "PRIVATE_BETA",
      releaseId: RELEASE_ID,
      applicationCommitSha: APPLICATION_SHA,
      workflowId: WORKFLOW_ID,
      sources: [
        { stage: "launch_dossier" },
        { stage: "bundled_execution" },
        { stage: "api_reliability" },
        { stage: "promotion_recovery" },
        { stage: "failure_campaign" },
        { stage: "canvas_manual" },
      ],
      proof: {
        connectedReleaseDossier: true,
        cleanBundledSupervisorAndS2Execution: true,
        apiDuplicateExpiryQueueAndFailureRelease: true,
        promotionRollbackBackupAndRestore: true,
        loadQueueWorkerAndProviderRecovery: true,
        browserAccessibilityTouchAndScale: true,
      },
      limitations: {
        publicBeta: false,
        generalAvailability: false,
        highAvailability: false,
        pointInTimeRecovery: false,
        crossRegionDisasterRecovery: false,
        unlimitedGraphScale: false,
        unlimitedThroughput: false,
        publicServiceLevelObjective: false,
      },
    });
    expect(dossier.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(dossier.sources.every((source) => /^[0-9a-f]{64}$/.test(source.canonicalEvidenceSha256))).toBe(
      true
    );
  });

  it("rejects duplicate, missing, and reused assembler run identities", () => {
    const duplicated = sources();
    duplicated[1].runId = duplicated[0].runId;
    duplicated[1].artifactName = `flowcordia-bundled-execution-${duplicated[0].runId}-1`;
    const bundled = duplicated[1].evidence as Record<string, unknown>;
    (bundled.workflow as Record<string, unknown>).runId = duplicated[0].runId;
    reseal(duplicated[1]);
    expect(() => create(duplicated)).toThrow(/must all be distinct/i);

    expect(() => create(sources().slice(0, 5))).toThrow(/exactly six/i);

    expect(() =>
      createFlowcordiaPrivateBetaDossier({
        releaseId: RELEASE_ID,
        applicationCommitSha: APPLICATION_SHA,
        workflowId: WORKFLOW_ID,
        repository: REPOSITORY,
        assembledAt: "2026-07-26T10:00:00.000Z",
        assemblerRunId: runIds.canvas_manual,
        assemblerRunAttempt: 1,
        sources: sources(),
      })
    ).toThrow(/must all be distinct/i);
  });

  it("rejects mixed commit, artifact, workflow, and release lineage", () => {
    const mixedCommit = sources();
    mixedCommit[2].workflowCommitSha = "5123456789abcdef0123456789abcdef01234567";
    expect(() => create(mixedCommit)).toThrow(/workflowCommitSha/i);

    const wrongArtifact = sources();
    wrongArtifact[4].artifactName = "flowcordia-beta-failure-wrong-1";
    expect(() => create(wrongArtifact)).toThrow(/artifactName/i);

    const wrongRelease = sources();
    (wrongRelease[0].evidence as Record<string, unknown>).releaseId = "another-release";
    reseal(wrongRelease[0]);
    expect(() => create(wrongRelease)).toThrow(/launch dossier release/i);
  });

  it("rejects missing operational and human acceptance proof", () => {
    const failedLoad = sources();
    const failureEvidence = failedLoad[4].evidence as Record<string, unknown>;
    (failureEvidence.load as Record<string, unknown>).completed = 23;
    reseal(failedLoad[4]);
    expect(() => create(failedLoad)).toThrow(/completed load/i);

    const missingCanvas = sources();
    const canvasEvidence = missingCanvas[5].evidence as Record<string, unknown>;
    (canvasEvidence.sessions as unknown[]).pop();
    reseal(missingCanvas[5]);
    expect(() => create(missingCanvas)).toThrow(/assistive-technology matrix/i);
  });

  it("rejects source evidence changed after its canonical digest was created", () => {
    const tampered = sources();
    (tampered[1].evidence as Record<string, unknown>).imageDigest = "0".repeat(64);
    expect(() => create(tampered)).toThrow(/canonical digest/i);
  });

  it("rejects sensitive source data and evidence completed after assembly", () => {
    const sensitive = sources();
    (sensitive[1].evidence as Record<string, unknown>).payload = "must-not-enter-dossier";
    expect(() => create(sensitive)).toThrow(/forbidden field payload/i);

    expect(() => create(sources(), "2026-07-26T09:45:00.000Z")).toThrow(
      /did not complete before final/i
    );
  });
});
