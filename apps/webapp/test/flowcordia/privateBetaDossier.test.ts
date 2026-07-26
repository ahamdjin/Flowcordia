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
const DIGEST = "a".repeat(64);

const runIds: Record<FlowcordiaPrivateBetaSourceStage, string> = {
  launch_dossier: "30190000001",
  bundled_execution: "30190000002",
  api_reliability: "30190000003",
  promotion_recovery: "30190000004",
  failure_campaign: "30190000005",
  canvas_manual: "30190000006",
};

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
        })),
        selfHost: {
          targetReleaseId: RELEASE_ID,
          targetApplicationCommitSha: APPLICATION_SHA,
        },
        assembledAt: "2026-07-26T09:00:00.000Z",
        manifestSha256: "b".repeat(64),
      };
    case "bundled_execution":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-bundled-execution",
        state: "READY",
        releaseId: RELEASE_ID,
        applicationCommitSha: APPLICATION_SHA,
        workflow: { runId: runIds[stage], runAttempt: 1, sourceSha: APPLICATION_SHA },
        installation: { clean: true, doctor: "READY", restart: "READY" },
        execution: {
          status: "COMPLETED_SUCCESSFULLY",
          supervisorWorkloadObserved: true,
          s2StateChanged: true,
        },
        teardown: { containersAbsent: true, networksAbsent: true, volumesAbsent: true },
        completedAt: "2026-07-26T09:10:00.000Z",
        evidenceSha256: "c".repeat(64),
      };
    case "api_reliability":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-api-trigger-reliability",
        state: "READY",
        applicationCommitSha: APPLICATION_SHA,
        workflow: { runId: runIds[stage], runAttempt: 1 },
        duplicateSuppression: { originalRunId: "run_original", duplicateRunId: "run_original" },
        idempotencyExpiry: {
          originalRunId: "run_original",
          afterExpiryRunId: "run_after_expiry",
          ttlSeconds: 60,
        },
        queueExpiry: { status: "EXPIRED", ttlSeconds: 60 },
        failedRunKeyRelease: {
          firstFailureRunId: "run_failure_one",
          secondFailureRunId: "run_failure_two",
        },
        completedAt: "2026-07-26T09:20:00.000Z",
        evidenceSha256: "d".repeat(64),
      };
    case "promotion_recovery":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-beta-promotion-recovery",
        state: "READY",
        releaseId: RELEASE_ID,
        applicationCommitSha: APPLICATION_SHA,
        workflowId: WORKFLOW_ID,
        sources: [
          { runId: "50100000001" },
          { runId: "50100000002" },
          { runId: "50100000003" },
        ],
        production: {
          proposalId: "proposal-production",
          mergeCommitSha: "2123456789abcdef0123456789abcdef01234567",
          deploymentVersion: "deployment-production",
          runFriendlyId: "run-production",
        },
        rollbackProduction: {
          proposalId: "proposal-rollback",
          mergeCommitSha: "3123456789abcdef0123456789abcdef01234567",
          deploymentVersion: "deployment-rollback",
          runFriendlyId: "run-rollback",
        },
        checkedAt: "2026-07-26T09:30:00.000Z",
        evidenceSha256: "e".repeat(64),
      };
    case "failure_campaign":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-beta-failure-campaign",
        state: "READY",
        releaseId: RELEASE_ID,
        applicationCommitSha: APPLICATION_SHA,
        workflow: { runId: runIds[stage], runAttempt: 1 },
        load: { submitted: 24, completed: 24, failed: 0 },
        queueSaturation: {
          submitted: 8,
          expired: 8,
          terminalStatus: "EXPIRED",
          recoveryStatus: "COMPLETED_SUCCESSFULLY",
        },
        workerLoss: { lostLeaseAttempt: 1, reclaimedAttempt: 2, terminalStatus: "SENT" },
        providerOutage: {
          firstStatus: "PENDING",
          firstFailureCode: "PROVIDER_REJECTED",
          recoveryStatus: "SENT",
          stableDeliveryId: true,
        },
        postFailureDiagnostics: "READY",
        teardown: { containersAbsent: true, networksAbsent: true, volumesAbsent: true },
        disasterRecovery: {
          backupManifestSha256: "f".repeat(64),
          restoreEvidenceSha256: "1".repeat(64),
        },
        completedAt: "2026-07-26T09:40:00.000Z",
        evidenceSha256: "2".repeat(64),
      };
    case "canvas_manual":
      return {
        schemaVersion: "0.1",
        kind: "flowcordia-canvas-manual-acceptance",
        state: "READY",
        applicationCommitSha: APPLICATION_SHA,
        source: { runId: runIds[stage], runAttempt: 1 },
        sessions: [
          { id: "nvda_chrome_windows" },
          { id: "nvda_firefox_windows" },
          { id: "voiceover_safari_macos" },
        ],
        viewports: [
          { id: "desktop_1280x720" },
          { id: "tablet_landscape_1024x768" },
          { id: "tablet_portrait_768x1024" },
          { id: "phone_390x844" },
        ],
        measurements: [{ graph: "production_70" }, { graph: "stress_300" }],
        limitations: {
          multiTouchPinchAdvertised: false,
          unlimitedGraphScaleAdvertised: false,
          virtualizationAdvertised: false,
        },
        sensitiveDataRecorded: false,
        completedAt: "2026-07-26T09:50:00.000Z",
        evidenceSha256: "3".repeat(64),
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
      evidence: evidence(stage),
    })
  );
}

function create(sourceInputs = sources(), assembledAt = "2026-07-26T10:00:00.000Z") {
  return createFlowcordiaPrivateBetaDossier({
    releaseId: RELEASE_ID,
    applicationCommitSha: APPLICATION_SHA,
    workflowId: WORKFLOW_ID,
    repository: "ahamdjin/flowcordia",
    assembledAt,
    assemblerRunId: "30190000007",
    assemblerRunAttempt: 1,
    sources: sourceInputs,
  });
}

describe("Flowcordia Private Beta dossier", () => {
  it("assembles exactly six official source artifacts into one bounded READY dossier", () => {
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
  });

  it("rejects duplicate, missing, and reused assembler run identities", () => {
    const duplicated = sources();
    duplicated[1].runId = duplicated[0].runId;
    duplicated[1].artifactName = `flowcordia-bundled-execution-${duplicated[0].runId}-1`;
    expect(() => create(duplicated)).toThrow(/must all be distinct/i);

    expect(() => create(sources().slice(0, 5))).toThrow(/exactly six/i);

    expect(() =>
      createFlowcordiaPrivateBetaDossier({
        releaseId: RELEASE_ID,
        applicationCommitSha: APPLICATION_SHA,
        workflowId: WORKFLOW_ID,
        repository: "ahamdjin/flowcordia",
        assembledAt: "2026-07-26T10:00:00.000Z",
        assemblerRunId: runIds.canvas_manual,
        assemblerRunAttempt: 1,
        sources: sources(),
      })
    ).toThrow(/must all be distinct/i);
  });

  it("rejects mixed commit, workflow, artifact, and release lineage", () => {
    const mixedCommit = sources();
    mixedCommit[2].workflowCommitSha = "4123456789abcdef0123456789abcdef01234567";
    expect(() => create(mixedCommit)).toThrow(/workflowCommitSha/i);

    const wrongArtifact = sources();
    wrongArtifact[4].artifactName = "flowcordia-beta-failure-wrong-1";
    expect(() => create(wrongArtifact)).toThrow(/artifactName/i);

    const wrongRelease = sources();
    (wrongRelease[0].evidence as Record<string, unknown>).releaseId = "another-release";
    expect(() => create(wrongRelease)).toThrow(/launch dossier release/i);
  });

  it("rejects missing operational and human acceptance proof", () => {
    const failedLoad = sources();
    const failureEvidence = failedLoad[4].evidence as Record<string, unknown>;
    (failureEvidence.load as Record<string, unknown>).completed = 23;
    expect(() => create(failedLoad)).toThrow(/completed load/i);

    const missingCanvas = sources();
    const canvasEvidence = missingCanvas[5].evidence as Record<string, unknown>;
    (canvasEvidence.sessions as unknown[]).pop();
    expect(() => create(missingCanvas)).toThrow(/session count/i);
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
