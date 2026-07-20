import { describe, expect, it } from "vitest";
import {
  assembleFlowcordiaReleaseManifest,
  FLOWCORDIA_RELEASE_EVIDENCE_STAGES,
  FLOWCORDIA_RELEASE_SOURCE_WORKFLOWS,
  flowcordiaReleaseArtifactName,
  flowcordiaReleaseEvidenceSha256,
  type FlowcordiaReleaseEvidenceSource,
  type FlowcordiaReleaseEvidenceStage,
} from "../../app/features/flowcordia/acceptance/release-manifest.server";

const applicationCommitSha = "1".repeat(40);
const proposalHeadSha = "a".repeat(40);
const mergeCommitSha = "b".repeat(40);
const targetHeadSha = "c".repeat(40);
const targetMergeCommitSha = "d".repeat(40);
const baseCommitSha = "e".repeat(40);
const baseBlobSha = "f".repeat(40);
const rollbackProposalHeadSha = "2".repeat(40);
const rollbackMergeCommitSha = "3".repeat(40);
const workflowCommitSha = "4".repeat(40);
const workflowId = "reference_workflow";
const proposalId = "proposal_reference";

function evidenceByStage(): Record<FlowcordiaReleaseEvidenceStage, Record<string, unknown>> {
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
    preview: {
      ...common,
      mode: "preview",
      startedAt: "2026-07-20T15:00:00.000Z",
      completedAt: "2026-07-20T15:01:00.000Z",
      readiness,
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

function sources(): FlowcordiaReleaseEvidenceSource[] {
  const evidence = evidenceByStage();
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
        workflowId,
        proposalId,
        runId,
      }),
      artifactArchiveSha256: String(index + 5).repeat(64),
      evidenceSha256: flowcordiaReleaseEvidenceSha256(evidence[stage]),
      evidence: evidence[stage],
    };
  });
}

function assemble(sourceEvidence = sources()) {
  return assembleFlowcordiaReleaseManifest({
    releaseId: "release-2026-07-20-reference",
    applicationCommitSha,
    workflowId,
    proposalId,
    assembledAt: "2026-07-20T15:10:00.000Z",
    sources: sourceEvidence,
  });
}

describe("Flowcordia release evidence manifest", () => {
  it("accepts one complete journey and records the actual rollback merge lineage", () => {
    const manifest = assemble();

    expect(manifest).toMatchObject({
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
        releaseId: "release-2026-07-20-reference",
        applicationCommitSha,
        workflowId,
        proposalId,
        assembledAt: "2026-07-20T15:08:30.000Z",
        sources: sources(),
      })
    ).toThrow("assembledAt precedes");
  });
});
