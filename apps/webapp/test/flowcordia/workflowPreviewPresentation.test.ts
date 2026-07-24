import type { ProposalState } from "@flowcordia/control-plane";
import { describe, expect, it } from "vitest";
import {
  presentFlowcordiaPreview,
  presentFlowcordiaRunMetadata,
} from "../../app/features/flowcordia/workflows/preview/presentation";

const HEAD_SHA = "b".repeat(40);

function proposal(state: ProposalState = "READY") {
  return {
    proposalId: "proposal-order-intake",
    proposalBranch: "flowcordia/proposals/order_intake/proposal-order-intake",
    pullRequestNumber: 17,
    headSha: HEAD_SHA,
    state,
  };
}

function projection(overrides: Partial<Parameters<typeof presentFlowcordiaPreview>[0]> = {}) {
  return presentFlowcordiaPreview({
    workflowId: "order_intake",
    previewDeploymentsEnabled: true,
    proposal: proposal(),
    environment: { branchName: proposal().proposalBranch },
    closure: {
      state: "READY",
      schemaVersion: "0.1",
      digest: "c".repeat(64),
      expectedCount: 2,
      installedCount: 2,
      missingWorkflowIds: [],
    },
    deployment: {
      shortCode: "dpl_123",
      version: "20260716.1",
      status: "DEPLOYED",
      commitSHA: HEAD_SHA,
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      deployedAt: new Date("2026-07-16T10:02:00.000Z"),
      workerId: "worker_exact",
    },
    run: {
      friendlyId: "run_123",
      status: "COMPLETED_SUCCESSFULLY",
      metadata: JSON.stringify({
        flowcordiaTrigger: {
          schemaVersion: "0.1",
          workflowId: "order_intake",
          proposalId: "proposal-order-intake",
          headSha: HEAD_SHA,
        },
        flowcordia: {
          schemaVersion: "0.1",
          workflowId: "order_intake",
          nodes: {
            manual_trigger: { operation: "trigger.manual", status: "SUCCEEDED" },
            route_order: {
              operation: "action.http",
              status: "FAILED",
              message: "secret-error-detail-must-not-reach-browser",
            },
          },
        },
        provider: { token: "secret-must-not-reach-browser" },
      }),
      createdAt: new Date("2026-07-16T10:03:00.000Z"),
      startedAt: new Date("2026-07-16T10:03:01.000Z"),
      completedAt: new Date("2026-07-16T10:03:02.000Z"),
      lockedToVersionId: "worker_exact",
    },
    ...overrides,
  });
}

describe("Flowcordia preview deployment presentation", () => {
  it("projects only the exact proposal head, deployment, run, and bounded node state", () => {
    const result = projection();
    const serialized = JSON.stringify(result);

    expect(result.state).toBe("READY");
    expect(result.deployment).toMatchObject({ commitSha: HEAD_SHA, version: "20260716.1" });
    expect(result.latestRun?.proof).toBe("VERIFIED");
    expect(result.latestRun?.nodes).toEqual([
      {
        nodeId: "manual_trigger",
        operation: "trigger.manual",
        status: "SUCCEEDED",
        message: null,
      },
      {
        nodeId: "route_order",
        operation: "action.http",
        status: "FAILED",
        message: null,
      },
    ]);
    expect(serialized).not.toContain("secret-must-not-reach-browser");
    expect(serialized).not.toContain("secret-error-detail-must-not-reach-browser");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("worker_exact");
  });

  it("waits when the observed deployment does not match the proposal head", () => {
    const result = projection({
      deployment: {
        shortCode: "dpl_old",
        version: "20260715.1",
        status: "DEPLOYED",
        commitSHA: "a".repeat(40),
        createdAt: new Date("2026-07-15T10:00:00.000Z"),
        deployedAt: new Date("2026-07-15T10:02:00.000Z"),
        workerId: "worker_old",
      },
    });

    expect(result.state).toBe("WAITING_FOR_DEPLOYMENT");
    expect(result.deployment).toBeNull();
  });

  it("waits for missing child tasks and fails legacy unrecorded closures", () => {
    const waiting = projection({
      closure: {
        state: "WAITING",
        schemaVersion: "0.1",
        digest: "c".repeat(64),
        expectedCount: 2,
        installedCount: 1,
        missingWorkflowIds: ["child"],
      },
    });
    expect(waiting.state).toBe("WAITING_FOR_CLOSURE");
    expect(waiting.latestRun).toBeNull();

    const legacy = projection({
      closure: {
        state: "NOT_RECORDED",
        schemaVersion: null,
        digest: null,
        expectedCount: 0,
        installedCount: 0,
        missingWorkflowIds: [],
      },
    });
    expect(legacy.state).toBe("FAILED");
    expect(legacy.message).toContain("Republish");
  });

  it("fails closed on malformed or mismatched run metadata", () => {
    expect(presentFlowcordiaRunMetadata("not-json", "order_intake")).toEqual([]);
    expect(
      presentFlowcordiaRunMetadata(
        JSON.stringify({
          flowcordia: {
            schemaVersion: "0.1",
            workflowId: "another_workflow",
            nodes: { route_order: { operation: "action.http", status: "SUCCEEDED" } },
          },
        }),
        "order_intake"
      )
    ).toEqual([]);
  });

  it("ignores runs from another proposal, head, or deployed worker", () => {
    const wrongProposal = projection({
      run: {
        friendlyId: "run_wrong_proposal",
        status: "COMPLETED_SUCCESSFULLY",
        metadata: JSON.stringify({
          flowcordiaTrigger: {
            schemaVersion: "0.1",
            workflowId: "order_intake",
            proposalId: "proposal-another-head",
            headSha: HEAD_SHA,
          },
          flowcordia: {
            schemaVersion: "0.1",
            workflowId: "order_intake",
            nodes: {
              manual_trigger: { operation: "trigger.manual", status: "SUCCEEDED" },
            },
          },
        }),
        createdAt: new Date("2026-07-16T10:03:00.000Z"),
        startedAt: new Date("2026-07-16T10:03:01.000Z"),
        completedAt: new Date("2026-07-16T10:03:02.000Z"),
        lockedToVersionId: "worker_exact",
      },
    });
    const wrongWorker = projection({
      run: {
        friendlyId: "run_wrong_worker",
        status: "COMPLETED_SUCCESSFULLY",
        metadata: JSON.stringify({
          flowcordiaTrigger: {
            schemaVersion: "0.1",
            workflowId: "order_intake",
            proposalId: "proposal-order-intake",
            headSha: HEAD_SHA,
          },
          flowcordia: {
            schemaVersion: "0.1",
            workflowId: "order_intake",
            nodes: {
              manual_trigger: { operation: "trigger.manual", status: "SUCCEEDED" },
            },
          },
        }),
        createdAt: new Date("2026-07-16T10:03:00.000Z"),
        startedAt: new Date("2026-07-16T10:03:01.000Z"),
        completedAt: new Date("2026-07-16T10:03:02.000Z"),
        lockedToVersionId: "worker_other",
      },
    });

    expect(wrongProposal.latestRun).toBeNull();
    expect(wrongWorker.latestRun).toBeNull();
  });

  it.each([
    { status: "EXECUTING", completedAt: null, proof: "PENDING" },
    {
      status: "COMPLETED_WITH_ERRORS",
      completedAt: new Date("2026-07-16T10:03:02.000Z"),
      proof: "FAILED",
    },
  ])("projects $status exact-head runs as $proof proof", ({ status, completedAt, proof }) => {
    const baseline = projection();
    if (!baseline.latestRun) throw new Error("Expected the baseline run.");
    const result = projection({
      run: {
        friendlyId: baseline.latestRun.friendlyId,
        status,
        metadata: JSON.stringify({
          flowcordiaTrigger: {
            schemaVersion: "0.1",
            workflowId: "order_intake",
            proposalId: "proposal-order-intake",
            headSha: HEAD_SHA,
          },
          flowcordia: {
            schemaVersion: "0.1",
            workflowId: "order_intake",
            nodes: {
              manual_trigger: { operation: "trigger.manual", status: "SUCCEEDED" },
            },
          },
        }),
        createdAt: new Date("2026-07-16T10:03:00.000Z"),
        startedAt: new Date("2026-07-16T10:03:01.000Z"),
        completedAt,
        lockedToVersionId: "worker_exact",
      },
    });

    expect(result.latestRun?.proof).toBe(proof);
  });

  it("fails successful terminal proof when bounded node evidence is missing", () => {
    const result = projection({
      run: {
        friendlyId: "run_missing_trace",
        status: "COMPLETED_SUCCESSFULLY",
        metadata: JSON.stringify({
          flowcordiaTrigger: {
            schemaVersion: "0.1",
            workflowId: "order_intake",
            proposalId: "proposal-order-intake",
            headSha: HEAD_SHA,
          },
        }),
        createdAt: new Date("2026-07-16T10:03:00.000Z"),
        startedAt: new Date("2026-07-16T10:03:01.000Z"),
        completedAt: new Date("2026-07-16T10:03:02.000Z"),
        lockedToVersionId: "worker_exact",
      },
    });

    expect(result.latestRun).toMatchObject({ proof: "FAILED", nodes: [] });
    expect(result.message).toContain("without successful trusted node evidence");
  });

  it("distinguishes disabled, failed, and closed preview ownership", () => {
    expect(projection({ previewDeploymentsEnabled: false }).state).toBe("DISABLED");
    expect(projection({ proposal: proposal("FAILED") }).state).toBe("FAILED");
    expect(projection({ proposal: proposal("MERGED") }).state).toBe("CLOSED");
  });
});
