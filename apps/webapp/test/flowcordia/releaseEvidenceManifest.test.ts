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

describe("Flowcordia release evidence manifest", () => {
  it("accepts one complete journey and records the actual rollback merge lineage", () => {
    const manifest = assemble();

    expect(manifest).toMatchObject({
      schemaVersion: "0.2",
      result: "ACCEPTED",
      applicationCommitSha,
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
    expect(manifest.sourceRuns.map((source) => source.stage)).toEqual(
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
    expect(() => assemble(sources().slice(0, 4))).toThrow("exactly five source artifacts");

    const duplicated = sources();
    duplicated[4] = structuredClone(duplicated[0]!);
    expect(() => assemble(duplicated)).toThrow("exactly one preview artifact");

    const reusedRun = sources();
    reusedRun[4]!.runId = reusedRun[3]!.runId;
    reusedRun[4]!.artifactName = flowcordiaReleaseArtifactName({
      stage: "rollback_production",
      workflowId,
      proposalId,
      runId: reusedRun[4]!.runId,
    });
    expect(() => assemble(reusedRun)).toThrow("distinct workflow run");
  });

  it("requires official workflow, artifact, archive, and evidence identities", () => {
    for (const mutate of [
      (source: FlowcordiaReleaseEvidenceSource) => {
        source.workflowPath = ".github/workflows/untrusted.yml";
      },
      (source: FlowcordiaReleaseEvidenceSource) => {
        source.artifactName = "forged-evidence";
      },
      (source: FlowcordiaReleaseEvidenceSource) => {
        source.artifactArchiveSha256 = "not-a-digest";
      },
      (source: FlowcordiaReleaseEvidenceSource) => {
        source.evidenceSha256 = "not-a-digest";
      },
    ]) {
      const complete = sources();
      mutate(complete[0]!);
      expect(() => assemble(complete)).toThrow();
    }
  });

  it("rejects failed, incomplete, sensitive, and structurally ambiguous evidence", () => {
    const failed = sources();
    failed[0]!.evidence.result = "FAILED";
    expect(() => assemble(failed)).toThrow("preview.result");

    const incomplete = sources();
    incomplete[0]!.evidence.stage = "preview";
    expect(() => assemble(incomplete)).toThrow("preview.stage");

    const sensitive = sources();
    sensitive[0]!.evidence.nested = { accessToken: "secret" };
    expect(() => assemble(sensitive)).toThrow("forbidden field");

    const unsupported = sources();
    unsupported[0]!.evidence.note = "ambiguous extra claim";
    expect(() => assemble(unsupported)).toThrow("must contain exactly");
  });

  it("requires positive HTTP, mapping, and credential capability proof", () => {
    for (const key of ["httpNodes", "mappingNodes", "readyCredentialBindings"] as const) {
      const incomplete = sources();
      const capabilities = incomplete[0]!.evidence.capabilities as Record<string, unknown>;
      capabilities[key] = 0;
      expect(() => assemble(incomplete)).toThrow(`preview.capabilities.${key}`);
    }
  });

  it("binds application, workflow, repository, proposal head, and merge identity", () => {
    const applicationMismatch = sources();
    applicationMismatch[2]!.evidence.applicationCommitSha = "9".repeat(40);
    expect(() => assemble(applicationMismatch)).toThrow("production.applicationCommitSha");

    const repositoryMismatch = sources();
    const promotionReadiness = repositoryMismatch[1]!.evidence.readiness as Record<string, unknown>;
    (promotionReadiness.repository as Record<string, unknown>).commitSha = "8".repeat(40);
    expect(() => assemble(repositoryMismatch)).toThrow("promotion.readiness.repository.commitSha");

    const headMismatch = sources();
    const production = headMismatch[2]!.evidence.production as Record<string, unknown>;
    production.observedHeadSha = "7".repeat(40);
    expect(() => assemble(headMismatch)).toThrow("production.production.observedHeadSha");

    const deploymentMismatch = sources();
    const deployed = deploymentMismatch[2]!.evidence.production as Record<string, unknown>;
    deployed.deploymentCommitSha = "6".repeat(40);
    expect(() => assemble(deploymentMismatch)).toThrow("production.production.deploymentCommitSha");
  });

  it("binds rollback creation to the exact production being rolled back", () => {
    for (const key of ["currentProposalId", "currentHeadSha", "currentMergeCommitSha"] as const) {
      const complete = sources();
      const rollback = complete[3]!.evidence.rollback as Record<string, unknown>;
      rollback[key] = key === "currentProposalId" ? "another_proposal" : "9".repeat(40);
      expect(() => assemble(complete)).toThrow(`rollback.${key}`);
    }
  });

  it("requires rollback production to deploy the new rollback proposal, not the old target commit", () => {
    const oldBrokenComparison = sources();
    const rollbackProduction = oldBrokenComparison[4]!.evidence.production as Record<
      string,
      unknown
    >;
    rollbackProduction.mergeCommitSha = targetMergeCommitSha;
    rollbackProduction.deploymentCommitSha = targetMergeCommitSha;
    expect(() => assemble(oldBrokenComparison)).toThrow("newly merged rollback proposal");

    const wrongRollbackHead = sources();
    const rollbackHead = wrongRollbackHead[4]!.evidence.production as Record<string, unknown>;
    rollbackHead.expectedHeadSha = targetHeadSha;
    rollbackHead.observedHeadSha = targetHeadSha;
    expect(() => assemble(wrongRollbackHead)).toThrow(
      "rollback_production.production.expectedHeadSha"
    );
  });

  it("requires a chronological completed journey before assembly", () => {
    const overlapping = sources();
    overlapping[2]!.evidence.startedAt = "2026-07-20T15:02:30.000Z";
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
