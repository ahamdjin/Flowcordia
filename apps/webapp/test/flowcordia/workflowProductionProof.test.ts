import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFlowcordiaProductionRunCommand,
  FLOWCORDIA_PRODUCTION_CONFIRMATION,
} from "../../app/features/flowcordia/workflows/production/command-contract";
import {
  flowcordiaProductionRunIdempotencyKey,
  flowcordiaProductionRunIdempotencyPrefix,
  flowcordiaProductionRunSeedMetadata,
  presentFlowcordiaProductionRunIdentity,
  selectFlowcordiaProductionRun,
} from "../../app/features/flowcordia/workflows/production/identity";
import { presentFlowcordiaProduction } from "../../app/features/flowcordia/workflows/production/presentation";

const workflowId = "reference_workflow";
const proposalId = "proposal_reference_123";
const mergeCommitSha = "b".repeat(40);
const workerId = "worker_internal_123";
const identity = { workflowId, proposalId, mergeCommitSha };

function proposal() {
  return {
    proposalId,
    headSha: "a".repeat(40),
    mergeCommitSha,
    state: "MERGED" as const,
  };
}

function deployment(
  commitSHA = mergeCommitSha,
  overrides: Partial<{
    status: string;
    workerId: string | null;
    deployedAt: Date | null;
  }> = {}
) {
  return {
    shortCode: "dep_public_123",
    version: "20260720.1",
    status: "DEPLOYED",
    commitSHA,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    deployedAt: new Date("2026-07-20T00:01:00.000Z"),
    workerId,
    ...overrides,
  };
}

function metadata(extraProduction: Record<string, unknown> = {}) {
  return JSON.stringify({
    flowcordiaProduction: {
      ...flowcordiaProductionRunSeedMetadata(identity),
      ...extraProduction,
    },
    flowcordia: {
      schemaVersion: "0.1",
      workflowId,
      nodes: {
        trigger: { operation: "trigger.api", status: "SUCCEEDED" },
        output: { operation: "output.result", status: "SUCCEEDED" },
      },
    },
  });
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    friendlyId: "run_public_123",
    status: "COMPLETED_SUCCESSFULLY",
    metadata: metadata(),
    createdAt: new Date("2026-07-20T00:02:00.000Z"),
    startedAt: new Date("2026-07-20T00:02:01.000Z"),
    completedAt: new Date("2026-07-20T00:02:03.000Z"),
    lockedToVersionId: workerId,
    ...overrides,
  };
}

describe("Flowcordia production proof identity", () => {
  it("namespaces idempotency by workflow, proposal, and exact merge commit", () => {
    expect(flowcordiaProductionRunIdempotencyPrefix(identity)).toBe(
      `flowcordia-production:${workflowId}:${proposalId}:${mergeCommitSha}:`
    );
    expect(
      flowcordiaProductionRunIdempotencyKey(identity, "11111111-2222-3333-4444-555555555555")
    ).toBe(
      `flowcordia-production:${workflowId}:${proposalId}:${mergeCommitSha}:11111111-2222-3333-4444-555555555555`
    );
  });

  it("fails closed on malformed, unknown, or mismatched production metadata", () => {
    expect(presentFlowcordiaProductionRunIdentity(metadata())).toEqual(identity);
    expect(presentFlowcordiaProductionRunIdentity("not-json")).toBeNull();
    expect(presentFlowcordiaProductionRunIdentity(metadata({ unexpected: true }))).toBeNull();
    expect(
      selectFlowcordiaProductionRun(
        [
          { metadata: metadata({ mergeCommitSha: "c".repeat(40) }), id: "wrong" },
          { metadata: metadata(), id: "exact" },
        ],
        identity
      )
    ).toEqual({ metadata: metadata(), id: "exact" });
  });
});

describe("Flowcordia production proof presentation", () => {
  it("verifies only the latest exact production deployment, worker lock, run identity, and node evidence", () => {
    expect(
      presentFlowcordiaProduction({
        workflowId,
        proposal: proposal(),
        environment: { id: "production_internal" },
        deployment: deployment(),
        run: run(),
      })
    ).toMatchObject({
      state: "READY",
      proposal: { proposalId, mergeCommitSha },
      deployment: { commitSha: mergeCommitSha, version: "20260720.1" },
      latestRun: {
        friendlyId: "run_public_123",
        status: "COMPLETED_SUCCESSFULLY",
        proof: "VERIFIED",
        nodes: [
          { nodeId: "trigger", status: "SUCCEEDED" },
          { nodeId: "output", status: "SUCCEEDED" },
        ],
      },
    });
  });

  it("blocks when the latest production deployment is for another commit", () => {
    expect(
      presentFlowcordiaProduction({
        workflowId,
        proposal: proposal(),
        environment: { id: "production_internal" },
        deployment: deployment("c".repeat(40)),
        run: null,
      })
    ).toMatchObject({ state: "OUT_OF_SYNC", latestRun: null });
  });

  it("keeps an exact latest deployment non-authoritative until it is deployed with a worker", () => {
    expect(
      presentFlowcordiaProduction({
        workflowId,
        proposal: proposal(),
        environment: { id: "production_internal" },
        deployment: deployment(mergeCommitSha, {
          status: "BUILDING",
          workerId: null,
          deployedAt: null,
        }),
        run: null,
      })
    ).toMatchObject({
      state: "DEPLOYING",
      deployment: { commitSha: mergeCommitSha, status: "BUILDING" },
      latestRun: null,
    });
  });

  it("fails an exact latest deployment with a terminal deployment failure", () => {
    expect(
      presentFlowcordiaProduction({
        workflowId,
        proposal: proposal(),
        environment: { id: "production_internal" },
        deployment: deployment(mergeCommitSha, {
          status: "FAILED",
          workerId: null,
          deployedAt: null,
        }),
        run: null,
      })
    ).toMatchObject({ state: "FAILED", latestRun: null });
  });

  it("does not trust a successful run with the wrong worker lock or identity", () => {
    expect(
      presentFlowcordiaProduction({
        workflowId,
        proposal: proposal(),
        environment: { id: "production_internal" },
        deployment: deployment(),
        run: run({ lockedToVersionId: "another_worker" }),
      }).latestRun
    ).toBeNull();
    expect(
      presentFlowcordiaProduction({
        workflowId,
        proposal: proposal(),
        environment: { id: "production_internal" },
        deployment: deployment(),
        run: run({ metadata: metadata({ mergeCommitSha: "c".repeat(40) }) }),
      }).latestRun
    ).toBeNull();
  });
});

describe("Flowcordia production proof command boundary", () => {
  it("builds the one explicit destructive command from public exact identity", () => {
    expect(
      buildFlowcordiaProductionRunCommand({
        workflowId,
        expectedProposalId: proposalId,
        expectedMergeCommitSha: mergeCommitSha,
        requestId: "11111111-2222-3333-4444-555555555555",
        payload: { fixture: "safe" },
      })
    ).toEqual({
      operation: "run_production",
      confirmation: FLOWCORDIA_PRODUCTION_CONFIRMATION,
      workflowId,
      expectedProposalId: proposalId,
      expectedMergeCommitSha: mergeCommitSha,
      requestId: "11111111-2222-3333-4444-555555555555",
      payload: { fixture: "safe" },
    });
  });

  it("keeps server identity and secret checks out of the browser contract", () => {
    const commands = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/production/commands.server.ts",
          import.meta.url
        )
      ),
      "utf8"
    );
    const query = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/production/query.server.ts",
          import.meta.url
        )
      ),
      "utf8"
    );
    const trigger = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/production/trigger.server.ts",
          import.meta.url
        )
      ),
      "utf8"
    );
    const panel = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/production/WorkflowProductionProofPanel.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );

    expect(commands).toContain("findInlineSecretPath(payload)");
    expect(commands).toContain('ability.can("trigger"');
    expect(query).toContain('orderBy: { createdAt: "desc" }');
    expect(query).toContain('deployment?.status === "DEPLOYED"');
    expect(trigger).toContain('candidate.state === "MERGED"');
    expect(trigger).toContain("latestMerged.mergeCommitSha !== input.expectedMergeCommitSha");
    expect(trigger).toContain('type: "PRODUCTION"');
    expect(trigger).toContain('deployment.status !== "DEPLOYED"');
    expect(trigger).toContain("deployment.commitSHA !== input.expectedMergeCommitSha");
    expect(trigger).toContain("lockToVersion: deployment.version");
    expect(trigger).not.toContain('status: "DEPLOYED",');
    expect(panel).not.toContain("./commands.server");
    expect(panel).not.toContain("sessionStorage");
    expect(panel).not.toContain("process.env");
  });
});
