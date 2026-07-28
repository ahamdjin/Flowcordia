import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioReactFlowConnectionCommand,
  buildWorkflowStudioReactFlowReconnectCommand,
} from "./canvas-react-flow";
import type { WorkflowStudioGraph } from "./presentation";

function graph(): WorkflowStudioGraph {
  return {
    workflowId: "workflow_1",
    name: "Reference workflow",
    description: null,
    schemaVersion: "1",
    labels: [],
    nodes: [
      {
        id: "trigger",
        name: "Trigger",
        kind: "trigger",
        operation: "trigger.manual",
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
      },
      {
        id: "condition",
        name: "Condition",
        kind: "control",
        operation: "control.condition",
        ownership: "visual",
        position: { x: 260, y: 0 },
        configurationKeys: [],
        editableConfiguration: {},
        functionId: null,
        inputSchema: null,
        outputSchema: null,
        credentialReferences: [],
        runtime: null,
        codeReference: null,
      },
      {
        id: "left",
        name: "Left",
        kind: "action",
        operation: "action.http",
        ownership: "visual",
        position: { x: 520, y: -100 },
        configurationKeys: [],
        editableConfiguration: {},
        functionId: null,
        inputSchema: null,
        outputSchema: null,
        credentialReferences: [],
        runtime: null,
        codeReference: null,
      },
      {
        id: "right",
        name: "Right",
        kind: "action",
        operation: "action.http",
        ownership: "visual",
        position: { x: 520, y: 100 },
        configurationKeys: [],
        editableConfiguration: {},
        functionId: null,
        inputSchema: null,
        outputSchema: null,
        credentialReferences: [],
        runtime: null,
        codeReference: null,
      },
    ],
    edges: [
      {
        id: "trigger_to_condition",
        source: "trigger",
        target: "condition",
        sourceHandle: null,
        targetHandle: null,
        condition: null,
      },
      {
        id: "condition_true",
        source: "condition",
        target: "left",
        sourceHandle: "true",
        targetHandle: null,
        condition: "true",
      },
    ],
    source: {
      path: ".flowcordia/workflows/reference.json",
      commitSha: "commit",
      blobSha: "blob",
      requestedRevision: "main",
      sourceSchemaVersion: "1",
      appliedMigrations: [],
    },
  };
}

describe("React Flow command adaptation", () => {
  it("turns a condition handle connection into the canonical command", () => {
    const result = buildWorkflowStudioReactFlowConnectionCommand({
      graph: graph(),
      connection: {
        source: "condition",
        sourceHandle: "false",
        target: "right",
        targetHandle: "target",
      },
    });

    expect(result).toEqual({
      success: true,
      command: {
        type: "connect_nodes",
        source: "condition",
        target: "right",
        condition: "false",
      },
    });
  });

  it("keeps cycle validation in the canonical graph boundary", () => {
    const result = buildWorkflowStudioReactFlowConnectionCommand({
      graph: graph(),
      connection: {
        source: "left",
        sourceHandle: "next",
        target: "trigger",
        targetHandle: "target",
      },
    });

    expect(result).toEqual({
      success: false,
      message: "Trigger nodes cannot receive incoming connections.",
    });
  });

  it("reconnects only the target and preserves the condition branch", () => {
    const result = buildWorkflowStudioReactFlowReconnectCommand({
      graph: graph(),
      edgeId: "condition_true",
      connection: {
        source: "condition",
        sourceHandle: "true",
        target: "right",
        targetHandle: "target",
      },
    });

    expect(result).toEqual({
      success: true,
      command: {
        type: "replace_edge",
        edgeId: "condition_true",
        target: "right",
        condition: "true",
      },
    });
  });

  it("does not let React Flow change an existing edge source", () => {
    const result = buildWorkflowStudioReactFlowReconnectCommand({
      graph: graph(),
      edgeId: "condition_true",
      connection: {
        source: "trigger",
        sourceHandle: "next",
        target: "right",
        targetHandle: "target",
      },
    });

    expect(result).toEqual({
      success: false,
      message:
        "Flowcordia keeps the source of an existing connection stable. Reconnect its target instead.",
    });
  });
});
