import { describe, expect, it } from "vitest";
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
    alertReleaseMismatch.find((entry) => entry.stage === "alert")!.evidence.releaseId =
      "other-release";
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
    unsupported.find((entry) => entry.stage === "alert")!.evidence.note = "ambiguous extra claim";
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
    applicationMismatch.find(
      (entry) => entry.stage === "production"
    )!.evidence.applicationCommitSha = "9".repeat(40);
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
