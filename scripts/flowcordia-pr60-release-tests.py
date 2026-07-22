from pathlib import Path

Path("apps/webapp/test/flowcordia/releaseEvidenceFixture.ts").write_text(r'''import {
  assembleFlowcordiaReleaseManifest,
  FLOWCORDIA_RELEASE_EVIDENCE_STAGES,
  FLOWCORDIA_RELEASE_SOURCE_WORKFLOWS,
  flowcordiaReleaseArtifactName,
  flowcordiaReleaseEvidenceSha256,
  type FlowcordiaReleaseEvidenceSource,
  type FlowcordiaReleaseEvidenceStage,
} from "../../app/features/flowcordia/acceptance/release-manifest.server";

export const applicationCommitSha = "1".repeat(40);
export const proposalHeadSha = "a".repeat(40);
export const mergeCommitSha = "b".repeat(40);
export const targetHeadSha = "c".repeat(40);
export const targetMergeCommitSha = "d".repeat(40);
export const baseCommitSha = "e".repeat(40);
export const baseBlobSha = "f".repeat(40);
export const rollbackProposalHeadSha = "2".repeat(40);
export const rollbackMergeCommitSha = "3".repeat(40);
export const workflowCommitSha = "4".repeat(40);
export const workflowId = "reference_workflow";
export const proposalId = "proposal_reference";
export const releaseId = "release-2026-07-20-reference";
export const assembledAt = "2026-07-20T15:10:00.000Z";

const installationChecks = [
  "runtime",
  "database",
  "application",
  "github_app",
  "environment",
  "web_secrets",
  "origins",
  "studio_rollout",
  "worker",
  "worker_delivery",
  "worker_limits",
];
const providerChecks = [
  "application_identity",
  "email_configuration",
  "object_store_configuration",
  "email_confirmation",
  "object_store_access",
  "email_acceptance",
];
const alertChecks = [
  "release_identity",
  "application_identity",
  "worker_configuration",
  "target_selection",
  "backlog_policy",
  "canary_confirmation",
  "worker_redis",
  "channel_selection",
  "production_coverage",
  "failure_coverage",
  "channel_configuration",
  "backlog_health",
  "canary_delivery",
];

function readyChecks(keys: readonly string[]) {
  return keys.map((key) => ({ key, state: "READY", message: `${key} is ready.` }));
}

export function releaseEvidenceByStage(): Record<
  FlowcordiaReleaseEvidenceStage,
  Record<string, unknown>
> {
  const common = {
    schemaVersion: "0.1",
    result: "PASSED",
    stage: "complete",
    workflowId,
    applicationCommitSha,
  };
  const readiness = {
    state: "READY",
    passed: 5,
    blocked: 0,
    unavailable: 0,
    repository: {
      owner: "flowcordia-reference",
      name: "workflow-fixtures",
      branch: "main",
      commitSha: "5".repeat(40),
    },
  };
  return {
    provider: {
      schemaVersion: "0.1",
      state: "READY",
      phase: "provider",
      checkedAt: "2026-07-20T14:58:00.000Z",
      installation: {
        schemaVersion: "0.1",
        profile: "release",
        state: "READY",
        message: "Release installation is ready.",
        checkedAt: "2026-07-20T14:58:00.000Z",
        checks: readyChecks(installationChecks),
      },
      providers: {
        schemaVersion: "0.1",
        state: "READY",
        phase: "complete",
        checkedAt: "2026-07-20T14:58:00.000Z",
        applicationCommitSha,
        emailTransport: "resend",
        objectStoreMode: "static_credentials",
        checks: readyChecks(providerChecks),
        message: "Providers accepted the bounded checks.",
      },
      message: "Provider readiness passed.",
    },
    alert: {
      schemaVersion: "0.1",
      state: "READY",
      phase: "complete",
      releaseId,
      checkedAt: "2026-07-20T14:59:00.000Z",
      applicationCommitSha,
      channelType: "SLACK",
      backlog: { pendingCount: 0, oldestPendingAgeMs: None },
      checks: readyChecks(alertChecks),
      message: "Alert readiness passed.",
    },
    preview: {
      ...common,
      schemaVersion: "0.2",
      mode: "preview",
      startedAt: "2026-07-20T15:00:00.000Z",
      completedAt: "2026-07-20T15:01:00.000Z",
      readiness,
      capabilities: {
        httpNodes: 1,
        mappingNodes: 1,
        readyCredentialBindings: 1,
      },
      preview: {
        state: "READY",
        expectedHeadSha: proposalHeadSha,
        observedHeadSha: proposalHeadSha,
        deploymentVersion: "preview-20260720.1",
        run: {
          friendlyId: "run_preview_123",
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    },
    promotion: {
      ...common,
      mode: "promotion",
      proposalId,
      startedAt: "2026-07-20T15:02:00.000Z",
      completedAt: "2026-07-20T15:03:00.000Z",
      readiness: structuredClone(readiness),
      governance: {
        state: "SATISFIED",
        evaluatedHeadSha: proposalHeadSha,
      },
      promotion: {
        expectedHeadSha: proposalHeadSha,
        mergeMethod: "squash",
        mergeCommitSha,
      },
    },
    production: {
      ...common,
      mode: "production",
      proposalId,
      startedAt: "2026-07-20T15:04:00.000Z",
      completedAt: "2026-07-20T15:05:00.000Z",
      production: {
        expectedHeadSha: proposalHeadSha,
        observedHeadSha: proposalHeadSha,
        mergeCommitSha,
        deploymentCommitSha: mergeCommitSha,
        deploymentVersion: "20260720.1",
        run: {
          friendlyId: "run_prod_123",
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    },
    rollback_proposal: {
      ...common,
      mode: "rollback_proposal",
      startedAt: "2026-07-20T15:06:00.000Z",
      completedAt: "2026-07-20T15:07:00.000Z",
      rollback: {
        currentProposalId: proposalId,
        currentHeadSha: proposalHeadSha,
        currentMergeCommitSha: mergeCommitSha,
        baseCommitSha,
        baseBlobSha,
        targetProposalId: "proposal_previous",
        targetHeadSha,
        targetMergeCommitSha,
        rollbackProposalId: "rollback_reference",
        rollbackProposalHeadSha,
        pullRequestNumber: 87,
      },
    },
    rollback_production: {
      ...common,
      mode: "rollback_production",
      proposalId: "rollback_reference",
      startedAt: "2026-07-20T15:08:00.000Z",
      completedAt: "2026-07-20T15:09:00.000Z",
      production: {
        expectedHeadSha: rollbackProposalHeadSha,
        observedHeadSha: rollbackProposalHeadSha,
        mergeCommitSha: rollbackMergeCommitSha,
        deploymentCommitSha: rollbackMergeCommitSha,
        deploymentVersion: "20260720.2",
        run: {
          friendlyId: "run_rollback_123",
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    },
  };
}

export function releaseEvidenceSources(): FlowcordiaReleaseEvidenceSource[] {
  const evidence = releaseEvidenceByStage();
  return FLOWCORDIA_RELEASE_EVIDENCE_STAGES.map((stage, index) => {
    const runId = String(101 + index);
    return {
      stage,
      runId,
      runAttempt: 1,
      workflowPath: FLOWCORDIA_RELEASE_SOURCE_WORKFLOWS[stage],
      workflowCommitSha,
      artifactName: flowcordiaReleaseArtifactName({
        stage,
        releaseId,
        workflowId,
        proposalId,
        runId,
      }),
      artifactArchiveSha256: String(index + 3).repeat(64),
      evidenceSha256: flowcordiaReleaseEvidenceSha256(evidence[stage]),
      evidence: evidence[stage],
    };
  });
}

export function assembleReleaseEvidence(sourceEvidence = releaseEvidenceSources()) {
  return assembleFlowcordiaReleaseManifest({
    releaseId,
    applicationCommitSha,
    workflowId,
    proposalId,
    assembledAt,
    sources: sourceEvidence,
  });
}
'''.replace('oldestPendingAgeMs: None', 'oldestPendingAgeMs: null'))

Path("apps/webapp/test/flowcordia/releaseEvidenceManifest.test.ts").write_text(r'''import { describe, expect, it } from "vitest";
import {
  assembleFlowcordiaReleaseManifest,
  FLOWCORDIA_RELEASE_EVIDENCE_STAGES,
  flowcordiaReleaseArtifactName,
  flowcordiaReleaseEvidenceSha256,
  type FlowcordiaReleaseEvidenceSource,
} from "../../app/features/flowcordia/acceptance/release-manifest.server";
import {
  applicationCommitSha,
  assembleReleaseEvidence as assemble,
  mergeCommitSha,
  proposalHeadSha,
  proposalId,
  releaseEvidenceSources as sources,
  releaseId,
  rollbackMergeCommitSha,
  rollbackProposalHeadSha,
  targetHeadSha,
  targetMergeCommitSha,
  workflowId,
} from "./releaseEvidenceFixture";

function source(stage: FlowcordiaReleaseEvidenceSource["stage"]) {
  return sources().find((entry) => entry.stage === stage)!;
}

describe("Flowcordia release evidence manifest", () => {
  it("accepts one complete operational and lifecycle journey", () => {
    const manifest = assemble();
    expect(manifest).toMatchObject({
      schemaVersion: "0.3",
      result: "ACCEPTED",
      applicationCommitSha,
      operations: {
        provider: {
          checkedAt: "2026-07-20T14:58:00.000Z",
          emailTransport: "resend",
          objectStoreMode: "static_credentials",
        },
        alert: {
          checkedAt: "2026-07-20T14:59:00.000Z",
          channelType: "SLACK",
          pendingCount: 0,
          oldestPendingAgeMs: null,
        },
      },
      workflowId,
      repository: {
        owner: "flowcordia-reference",
        name: "workflow-fixtures",
        branch: "main",
      },
      proposal: {
        id: proposalId,
        headSha: proposalHeadSha,
        mergeCommitSha,
      },
      capabilities: {
        httpNodes: 1,
        mappingNodes: 1,
        readyCredentialBindings: 1,
      },
      production: {
        deploymentCommitSha: mergeCommitSha,
        deploymentVersion: "20260720.1",
      },
      rollback: {
        target: {
          proposalId: "proposal_previous",
          headSha: targetHeadSha,
          mergeCommitSha: targetMergeCommitSha,
        },
        proposal: {
          id: "rollback_reference",
          headSha: rollbackProposalHeadSha,
          pullRequestNumber: 87,
          mergeCommitSha: rollbackMergeCommitSha,
        },
        production: {
          deploymentCommitSha: rollbackMergeCommitSha,
          deploymentVersion: "20260720.2",
        },
      },
    });
    expect(manifest.sourceRuns.map((entry) => entry.stage)).toEqual(
      FLOWCORDIA_RELEASE_EVIDENCE_STAGES
    );
    expect(manifest.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is canonical regardless of source input order", () => {
    const forward = assemble();
    const reversed = assemble(sources().reverse());
    expect(reversed).toEqual(forward);
    expect(flowcordiaReleaseEvidenceSha256({ b: 2, a: { d: 4, c: 3 } })).toBe(
      flowcordiaReleaseEvidenceSha256({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("fails closed for missing, duplicated, or reused source runs", () => {
    expect(() => assemble(sources().slice(0, 6))).toThrow("exactly seven source artifacts");

    const duplicated = sources();
    duplicated[6] = structuredClone(duplicated[0]!);
    expect(() => assemble(duplicated)).toThrow("exactly one provider artifact");

    const reusedRun = sources();
    reusedRun[6]!.runId = reusedRun[5]!.runId;
    reusedRun[6]!.artifactName = flowcordiaReleaseArtifactName({
      stage: "rollback_production",
      releaseId,
      workflowId,
      proposalId,
      runId: reusedRun[6]!.runId,
    });
    expect(() => assemble(reusedRun)).toThrow("distinct workflow run");
  });

  it("requires official workflow, artifact, archive, and evidence identities", () => {
    for (const mutate of [
      (entry: FlowcordiaReleaseEvidenceSource) => {
        entry.workflowPath = ".github/workflows/untrusted.yml";
      },
      (entry: FlowcordiaReleaseEvidenceSource) => {
        entry.artifactName = "forged-evidence";
      },
      (entry: FlowcordiaReleaseEvidenceSource) => {
        entry.artifactArchiveSha256 = "not-a-digest";
      },
      (entry: FlowcordiaReleaseEvidenceSource) => {
        entry.evidenceSha256 = "not-a-digest";
      },
    ]) {
      const complete = sources();
      mutate(complete[0]!);
      expect(() => assemble(complete)).toThrow();
    }
  });

  it("requires exact READY provider and alert evidence", () => {
    const providerBlocked = sources();
    providerBlocked.find((entry) => entry.stage === "provider")!.evidence.state = "BLOCKED";
    expect(() => assemble(providerBlocked)).toThrow("provider.state");

    const alertBlocked = sources();
    alertBlocked.find((entry) => entry.stage === "alert")!.evidence.state = "BLOCKED";
    expect(() => assemble(alertBlocked)).toThrow("alert.state");

    const alertReleaseMismatch = sources();
    alertReleaseMismatch.find((entry) => entry.stage === "alert")!.evidence.releaseId = "other-release";
    expect(() => assemble(alertReleaseMismatch)).toThrow("alert.releaseId");

    const providerApplicationMismatch = sources();
    const provider = providerApplicationMismatch.find((entry) => entry.stage === "provider")!
      .evidence.providers as Record<string, unknown>;
    provider.applicationCommitSha = "9".repeat(40);
    expect(() => assemble(providerApplicationMismatch)).toThrow(
      "provider.providers.applicationCommitSha"
    );
  });

  it("requires fresh, ordered operational evidence before browser acceptance", () => {
    const stale = sources();
    stale.find((entry) => entry.stage === "provider")!.evidence.checkedAt =
      "2026-07-18T14:58:00.000Z";
    const installation = stale.find((entry) => entry.stage === "provider")!.evidence
      .installation as Record<string, unknown>;
    const providers = stale.find((entry) => entry.stage === "provider")!.evidence
      .providers as Record<string, unknown>;
    installation.checkedAt = "2026-07-18T14:58:00.000Z";
    providers.checkedAt = "2026-07-18T14:58:00.000Z";
    expect(() => assemble(stale)).toThrow("freshness window");

    const reversed = sources();
    reversed.find((entry) => entry.stage === "alert")!.evidence.checkedAt =
      "2026-07-20T14:57:00.000Z";
    expect(() => assemble(reversed)).toThrow("precedes provider");

    const afterPreview = sources();
    afterPreview.find((entry) => entry.stage === "alert")!.evidence.checkedAt =
      "2026-07-20T15:00:30.000Z";
    expect(() => assemble(afterPreview)).toThrow("preview started before alert completed");
  });

  it("rejects sensitive and structurally ambiguous evidence", () => {
    const sensitive = sources();
    sensitive.find((entry) => entry.stage === "provider")!.evidence.nested = {
      accessToken: "secret",
    };
    expect(() => assemble(sensitive)).toThrow("forbidden field");

    const unsupported = sources();
    unsupported.find((entry) => entry.stage === "alert")!.evidence.note =
      "ambiguous extra claim";
    expect(() => assemble(unsupported)).toThrow("must contain exactly");
  });

  it("requires positive HTTP, mapping, and credential capability proof", () => {
    for (const key of ["httpNodes", "mappingNodes", "readyCredentialBindings"] as const) {
      const incomplete = sources();
      const capabilities = incomplete.find((entry) => entry.stage === "preview")!.evidence
        .capabilities as Record<string, unknown>;
      capabilities[key] = 0;
      expect(() => assemble(incomplete)).toThrow(`preview.capabilities.${key}`);
    }
  });

  it("binds application, workflow, repository, proposal head, and merge identity", () => {
    const applicationMismatch = sources();
    applicationMismatch.find((entry) => entry.stage === "production")!.evidence.applicationCommitSha =
      "9".repeat(40);
    expect(() => assemble(applicationMismatch)).toThrow("production.applicationCommitSha");

    const repositoryMismatch = sources();
    const promotionReadiness = repositoryMismatch.find((entry) => entry.stage === "promotion")!
      .evidence.readiness as Record<string, unknown>;
    (promotionReadiness.repository as Record<string, unknown>).commitSha = "8".repeat(40);
    expect(() => assemble(repositoryMismatch)).toThrow("promotion.readiness.repository.commitSha");

    const headMismatch = sources();
    const production = headMismatch.find((entry) => entry.stage === "production")!.evidence
      .production as Record<string, unknown>;
    production.observedHeadSha = "7".repeat(40);
    expect(() => assemble(headMismatch)).toThrow("production.production.observedHeadSha");
  });

  it("binds rollback creation to the exact production being rolled back", () => {
    for (const key of ["currentProposalId", "currentHeadSha", "currentMergeCommitSha"] as const) {
      const complete = sources();
      const rollback = complete.find((entry) => entry.stage === "rollback_proposal")!.evidence
        .rollback as Record<string, unknown>;
      rollback[key] = key === "currentProposalId" ? "another_proposal" : "9".repeat(40);
      expect(() => assemble(complete)).toThrow(`rollback.${key}`);
    }
  });

  it("requires rollback production to deploy the new rollback proposal", () => {
    const oldBrokenComparison = sources();
    const rollbackProduction = oldBrokenComparison.find(
      (entry) => entry.stage === "rollback_production"
    )!.evidence.production as Record<string, unknown>;
    rollbackProduction.mergeCommitSha = targetMergeCommitSha;
    rollbackProduction.deploymentCommitSha = targetMergeCommitSha;
    expect(() => assemble(oldBrokenComparison)).toThrow("newly merged rollback proposal");

    const wrongRollbackHead = sources();
    const rollbackHead = wrongRollbackHead.find((entry) => entry.stage === "rollback_production")!
      .evidence.production as Record<string, unknown>;
    rollbackHead.expectedHeadSha = targetHeadSha;
    rollbackHead.observedHeadSha = targetHeadSha;
    expect(() => assemble(wrongRollbackHead)).toThrow(
      "rollback_production.production.expectedHeadSha"
    );
  });

  it("requires a chronological completed journey before assembly", () => {
    const overlapping = sources();
    overlapping.find((entry) => entry.stage === "production")!.evidence.startedAt =
      "2026-07-20T15:02:30.000Z";
    expect(() => assemble(overlapping)).toThrow("production started before promotion completed");

    expect(() =>
      assembleFlowcordiaReleaseManifest({
        releaseId,
        applicationCommitSha,
        workflowId,
        proposalId,
        assembledAt: "2026-07-20T15:08:30.000Z",
        sources: sources(),
      })
    ).toThrow("assembledAt precedes");
  });
});
''')
