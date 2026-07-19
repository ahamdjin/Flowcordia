import { describe, expect, it } from "vitest";
import type { FlowcordiaPreviewProjection } from "../../app/features/flowcordia/workflows/preview/presentation";
import type {
  WorkflowStudioDraft,
  WorkflowStudioGraph,
} from "../../app/features/flowcordia/workflows/studio/presentation";
import {
  buildWorkflowStudioLiveRunCommand,
  buildWorkflowStudioStructuralTestCommand,
  workflowStudioTestingAvailability,
} from "../../app/features/flowcordia/workflows/studio/testing-command";

const COMMIT_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);

const GRAPH: WorkflowStudioGraph = {
  workflowId: "order_intake",
  name: "Order intake",
  description: null,
  schemaVersion: "0.1",
  labels: [],
  nodes: [],
  edges: [],
  source: {
    path: ".flowcordia/workflows/order_intake.json",
    commitSha: COMMIT_SHA,
    blobSha: "c".repeat(40),
    requestedRevision: COMMIT_SHA,
    sourceSchemaVersion: "0.1",
    appliedMigrations: [],
  },
};

const DRAFT: WorkflowStudioDraft = {
  publicId: "draft_order_intake",
  workflowId: GRAPH.workflowId,
  version: "7",
  documentSha256: "d".repeat(64),
  baseCommitSha: COMMIT_SHA,
  createdAt: "2026-07-19T12:00:00.000Z",
  updatedAt: "2026-07-19T12:01:00.000Z",
  stale: false,
};

function preview(
  overrides: Partial<FlowcordiaPreviewProjection> = {}
): FlowcordiaPreviewProjection {
  return {
    state: "NOT_REQUESTED",
    message: "No preview requested.",
    proposal: null,
    deployment: null,
    latestRun: null,
    ...overrides,
  };
}

function availability(
  overrides: Partial<Parameters<typeof workflowStudioTestingAvailability>[0]> = {}
) {
  return workflowStudioTestingAvailability({
    graph: GRAPH,
    draft: DRAFT,
    preview: preview(),
    canWrite: true,
    canTriggerPreview: false,
    stale: false,
    loadError: null,
    ...overrides,
  });
}

describe("Flowcordia Studio testing command ownership", () => {
  it("keeps the panel hidden when no trustworthy graph is loaded", () => {
    expect(availability({ graph: null })).toEqual({
      visible: false,
      structuralEnabled: false,
      liveEnabled: false,
    });
  });

  it("enables structural preview only for a writable current draft", () => {
    expect(availability()).toEqual({
      visible: true,
      structuralEnabled: true,
      liveEnabled: false,
    });
    expect(availability({ canWrite: false }).structuralEnabled).toBe(false);
    expect(availability({ draft: { ...DRAFT, stale: true } }).structuralEnabled).toBe(false);
    expect(availability({ stale: true }).structuralEnabled).toBe(false);
    expect(
      availability({
        loadError: { code: "identity_mismatch", message: "Blocked safely.", retryable: false },
      }).structuralEnabled
    ).toBe(false);
  });

  it("enables live execution only for an authorized exact-head ready preview", () => {
    const ready = preview({
      state: "READY",
      message: "Preview deployed.",
      proposal: {
        proposalId: "proposal-order-intake",
        branch: "flowcordia/order-intake",
        pullRequestNumber: 42,
        headSha: HEAD_SHA,
      },
    });

    expect(availability({ draft: null, preview: ready, canTriggerPreview: true })).toEqual({
      visible: true,
      structuralEnabled: false,
      liveEnabled: true,
    });
    expect(
      availability({ draft: null, preview: ready, canTriggerPreview: false }).liveEnabled
    ).toBe(false);
    expect(
      availability({
        draft: null,
        preview: { ...ready, proposal: { ...ready.proposal!, headSha: null } },
        canTriggerPreview: true,
      }).liveEnabled
    ).toBe(false);
    expect(
      availability({
        draft: null,
        preview: { ...ready, state: "DEPLOYING" },
        canTriggerPreview: true,
      }).liveEnabled
    ).toBe(false);
  });

  it("builds the exact structural command without inventing a fixture", () => {
    expect(
      buildWorkflowStudioStructuralTestCommand({
        draft: DRAFT,
        payload: { leadId: "lead_123" },
        fixture: null,
      })
    ).toEqual({
      operation: "test",
      draftId: DRAFT.publicId,
      expectedVersion: DRAFT.version,
      payload: { leadId: "lead_123" },
    });
  });

  it("includes only the selected bounded fixture identity", () => {
    expect(
      buildWorkflowStudioStructuralTestCommand({
        draft: DRAFT,
        payload: { leadId: "lead_123" },
        fixture: { nodeId: "qualify", fixtureId: "qualified_lead" },
      })
    ).toEqual({
      operation: "test",
      draftId: DRAFT.publicId,
      expectedVersion: DRAFT.version,
      payload: { leadId: "lead_123" },
      fixture: { nodeId: "qualify", fixtureId: "qualified_lead" },
    });
  });

  it("builds the exact version-locked live-run command", () => {
    const requestId = "0198a9a2-7fd1-4a16-85da-f27d07d6f8a1";

    expect(
      buildWorkflowStudioLiveRunCommand({
        workflowId: GRAPH.workflowId,
        expectedHeadSha: HEAD_SHA,
        requestId,
        payload: { leadId: "lead_123" },
      })
    ).toEqual({
      operation: "run",
      workflowId: GRAPH.workflowId,
      expectedHeadSha: HEAD_SHA,
      requestId,
      payload: { leadId: "lead_123" },
    });
  });
});
