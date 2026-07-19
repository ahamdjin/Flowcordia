import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioCanvasConnectionCommand,
  workflowStudioCanvasSourceHandles,
  workflowStudioCanvasTargetEligibility,
} from "../../app/features/flowcordia/workflows/studio/canvas-connections";
import type {
  WorkflowStudioGraph,
  WorkflowStudioNode,
} from "../../app/features/flowcordia/workflows/studio/presentation";

function node(id: string, kind: WorkflowStudioNode["kind"], operation: string): WorkflowStudioNode {
  return {
    id,
    name: id,
    kind,
    operation,
    ownership: "visual",
    position: { x: 0, y: 0 },
    configurationKeys: [],
    editableConfiguration: {},
    functionId: null,
    inputSchema: null,
    outputSchema: null,
    credentialReferences: [],
    runtime: null,
    codeReference: null,
  };
}

function graph(overrides: Partial<WorkflowStudioGraph> = {}): WorkflowStudioGraph {
  return {
    workflowId: "order_intake",
    name: "Order intake",
    description: null,
    schemaVersion: "0.1",
    labels: [],
    nodes: [
      node("start", "trigger", "trigger.manual"),
      node("condition", "control", "control.condition"),
      node("action", "action", "action.http"),
      node("output", "output", "output.return"),
    ],
    edges: [],
    source: {
      path: ".flowcordia/workflows/order_intake.json",
      commitSha: "a".repeat(40),
      blobSha: "b".repeat(40),
      requestedRevision: "a".repeat(40),
      sourceSchemaVersion: "0.1",
      appliedMigrations: [],
    },
    ...overrides,
  };
}

describe("Flowcordia direct canvas connections", () => {
  it("offers ordinary, condition, and terminal source handles", () => {
    expect(workflowStudioCanvasSourceHandles(graph(), "action")).toEqual([
      {
        id: "action:next",
        label: "Connect next",
        condition: null,
        available: true,
        reason: null,
      },
    ]);
    expect(workflowStudioCanvasSourceHandles(graph(), "condition")).toEqual([
      {
        id: "condition:true",
        label: "True branch",
        condition: "true",
        available: true,
        reason: null,
      },
      {
        id: "condition:false",
        label: "False branch",
        condition: "false",
        available: true,
        reason: null,
      },
    ]);
    expect(workflowStudioCanvasSourceHandles(graph(), "output")).toEqual([
      {
        id: "output:output",
        label: "Output is terminal",
        condition: null,
        available: false,
        reason: "Output nodes cannot start another connection.",
      },
    ]);
  });

  it("disables a condition branch that already has an edge", () => {
    const value = graph({
      edges: [
        {
          id: "condition_to_action",
          source: "condition",
          target: "action",
          sourceHandle: null,
          targetHandle: null,
          condition: "true",
        },
      ],
    });
    expect(workflowStudioCanvasSourceHandles(value, "condition")).toEqual([
      {
        id: "condition:true",
        label: "True branch",
        condition: "true",
        available: false,
        reason: "The true branch is already connected.",
      },
      {
        id: "condition:false",
        label: "False branch",
        condition: "false",
        available: true,
        reason: null,
      },
    ]);
  });

  it("builds exact ordinary and condition edit commands", () => {
    expect(
      buildWorkflowStudioCanvasConnectionCommand({
        graph: graph(),
        pending: { sourceId: "start", condition: null },
        targetId: "action",
      })
    ).toEqual({
      success: true,
      command: { type: "connect_nodes", source: "start", target: "action" },
    });
    expect(
      buildWorkflowStudioCanvasConnectionCommand({
        graph: graph(),
        pending: { sourceId: "condition", condition: "false" },
        targetId: "output",
      })
    ).toEqual({
      success: true,
      command: {
        type: "connect_nodes",
        source: "condition",
        target: "output",
        condition: "false",
      },
    });
  });

  it("rejects self, incoming trigger, terminal output, duplicate branch, and cycles", () => {
    const value = graph({
      edges: [
        {
          id: "start_to_condition",
          source: "start",
          target: "condition",
          sourceHandle: null,
          targetHandle: null,
          condition: null,
        },
        {
          id: "condition_to_action",
          source: "condition",
          target: "action",
          sourceHandle: null,
          targetHandle: null,
          condition: "true",
        },
      ],
    });
    expect(
      workflowStudioCanvasTargetEligibility({
        graph: value,
        pending: { sourceId: "action", condition: null },
        targetId: "action",
      })
    ).toEqual({ eligible: false, message: "A node cannot connect directly to itself." });
    expect(
      workflowStudioCanvasTargetEligibility({
        graph: value,
        pending: { sourceId: "action", condition: null },
        targetId: "start",
      })
    ).toEqual({
      eligible: false,
      message: "Trigger nodes cannot receive incoming connections.",
    });
    expect(
      workflowStudioCanvasTargetEligibility({
        graph: value,
        pending: { sourceId: "output", condition: null },
        targetId: "action",
      })
    ).toEqual({
      eligible: false,
      message: "Output nodes cannot start another connection.",
    });
    expect(
      workflowStudioCanvasTargetEligibility({
        graph: value,
        pending: { sourceId: "condition", condition: "true" },
        targetId: "output",
      })
    ).toEqual({
      eligible: false,
      message: "The true branch is already connected.",
    });
    expect(
      workflowStudioCanvasTargetEligibility({
        graph: value,
        pending: { sourceId: "action", condition: null },
        targetId: "condition",
      })
    ).toEqual({ eligible: false, message: "That connection would create a cycle." });
  });

  it("keeps direct connection ownership in the extracted canvas", () => {
    const studioSource = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );
    const canvasSource = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );

    expect(studioSource).toContain("<WorkflowStudioCanvas");
    expect(studioSource).toContain("onConnect={submitEdit}");
    expect(studioSource).not.toContain("function Canvas(");
    expect(studioSource).not.toContain("Connect to</span>");
    expect(canvasSource).toContain("workflowStudioCanvasSourceHandles");
    expect(canvasSource).toContain("aria-label={`Connect to ${node.name}`}");
  });
});
