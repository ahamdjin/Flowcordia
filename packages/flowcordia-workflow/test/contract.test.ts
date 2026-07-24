import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "../src/index.js";
import {
  bindFlowcordiaSubflowNodeContract,
  deriveFlowcordiaCallableWorkflowContract,
  flowcordiaCallableSchemasEqual,
  resolveFlowcordiaCallableContractGraph,
  validateFlowcordiaSubflowContractBindings,
} from "../src/index.js";

const commit = "a".repeat(40);
const otherCommit = "b".repeat(40);
const inputSchema = {
  type: "object",
  required: ["orderId"],
  properties: { orderId: { type: "string" } },
  additionalProperties: false,
} as const;
const outputSchema = {
  type: "object",
  required: ["accepted"],
  properties: { accepted: { type: "boolean" } },
  additionalProperties: false,
} as const;

function callable(id: string, child?: string): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id,
    name: id,
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
        outputSchema: inputSchema,
      },
      ...(child
        ? [
            {
              id: "child",
              kind: "subflow" as const,
              operation: "subflow.invoke",
              position: { x: 150, y: 0 },
              configuration: { workflowId: child, mode: "single" },
              inputSchema,
              outputSchema,
            },
          ]
        : []),
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 300, y: 0 },
        configuration: {},
        inputSchema: outputSchema,
      },
    ],
    edges: child
      ? [
          { id: "trigger-child", source: "trigger", target: "child" },
          { id: "child-output", source: "child", target: "output" },
        ]
      : [{ id: "trigger-output", source: "trigger", target: "output" }],
  };
}

describe("Flowcordia callable workflow contracts", () => {
  it("derives an explicit trigger-to-output callable contract", () => {
    expect(deriveFlowcordiaCallableWorkflowContract(callable("child"))).toEqual({
      success: true,
      contract: { version: 1, inputSchema, outputSchema },
    });
  });

  it("compares callable schemas canonically instead of trusting object key order", () => {
    expect(
      flowcordiaCallableSchemasEqual(
        {
          additionalProperties: false,
          properties: { orderId: { type: "string" } },
          required: ["orderId"],
          type: "object",
        },
        inputSchema
      )
    ).toBe(true);
  });

  it("blocks workflows without an explicit output boundary without invalidating the workflow", () => {
    const workflow = callable("child");
    delete workflow.nodes.at(-1)!.inputSchema;
    const result = deriveFlowcordiaCallableWorkflowContract(workflow);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issue.code).toBe("missing_output_contract");
  });

  it("blocks callable schemas outside the supported object-root subset", () => {
    const workflow = callable("child");
    workflow.nodes[0]!.outputSchema = { type: "array", items: { type: "string" } };
    const result = deriveFlowcordiaCallableWorkflowContract(workflow);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issue.code).toBe("invalid_input_contract");
  });

  it("resolves a transitive exact-revision callable graph", () => {
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "leaf",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("leaf"),
        },
        {
          workflowId: "parent",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("parent", "leaf"),
        },
      ],
    });
    expect(result.get("leaf")?.state).toBe("READY");
    expect(result.get("parent")?.state).toBe("READY");
  });

  it("blocks duplicate workflow identities instead of selecting one repository entry", () => {
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "leaf",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("leaf"),
        },
        {
          workflowId: "leaf",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("leaf"),
        },
      ],
    });
    expect(result.get("leaf")).toMatchObject({
      state: "BLOCKED",
      issue: { code: "duplicate_workflow" },
    });
  });

  it("blocks mixed-revision entries before exposing a callable contract", () => {
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "leaf",
          status: "VALID",
          sourceCommitSha: otherCommit,
          workflow: callable("leaf"),
        },
      ],
    });
    expect(result.get("leaf")).toMatchObject({
      state: "BLOCKED",
      issue: { code: "mixed_revision" },
    });
  });

  it("blocks a parent whose child is missing from the exact repository revision", () => {
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "parent",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("parent", "missing-child"),
        },
      ],
    });
    expect(result.get("parent")).toMatchObject({
      state: "BLOCKED",
      issue: { code: "missing_child" },
    });
  });

  it("blocks a parent whose child workflow is invalid", () => {
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "parent",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("parent", "invalid-child"),
        },
        {
          workflowId: "invalid-child",
          status: "INVALID",
          sourceCommitSha: commit,
          workflow: null,
        },
      ],
    });
    expect(result.get("parent")).toMatchObject({
      state: "BLOCKED",
      issue: { code: "invalid_child" },
    });
  });

  it("blocks parent readiness when a bound node drifts from the child contract", () => {
    const parent = callable("parent", "leaf");
    parent.nodes[1]!.inputSchema = { type: "object" };
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "leaf",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("leaf"),
        },
        { workflowId: "parent", status: "VALID", sourceCommitSha: commit, workflow: parent },
      ],
    });
    expect(result.get("parent")).toMatchObject({
      state: "BLOCKED",
      issue: { code: "contract_mismatch" },
    });
  });

  it("blocks recursive callable graphs", () => {
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "alpha",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("alpha", "beta"),
        },
        {
          workflowId: "beta",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("beta", "alpha"),
        },
      ],
    });
    expect(result.get("alpha")?.state).toBe("BLOCKED");
    expect(result.get("beta")?.state).toBe("BLOCKED");
  });

  it("binds exact indexed schemas while preserving invocation configuration", () => {
    const parent = callable("parent", "leaf");
    parent.nodes[1]!.inputSchema = { type: "object" };
    const result = bindFlowcordiaSubflowNodeContract({
      workflow: parent,
      nodeId: "child",
      configuration: {
        workflowId: "leaf",
        mode: "batch",
        itemsPath: "orders",
        maxItems: 10,
      },
      contract: { version: 1, inputSchema, outputSchema },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.nodes[1]).toMatchObject({
      configuration: {
        workflowId: "leaf",
        mode: "batch",
        itemsPath: "orders",
        maxItems: 10,
      },
      inputSchema,
      outputSchema,
    });
  });

  it("rejects self-reference during server-side subflow binding", () => {
    const result = bindFlowcordiaSubflowNodeContract({
      workflow: callable("parent", "leaf"),
      nodeId: "child",
      configuration: { workflowId: "parent", mode: "single" },
      contract: { version: 1, inputSchema, outputSchema },
    });
    expect(result).toEqual({
      success: false,
      message: "A workflow cannot invoke itself as a subflow.",
    });
  });

  it("rejects malformed invocation configuration before binding indexed schemas", () => {
    const result = bindFlowcordiaSubflowNodeContract({
      workflow: callable("parent", "leaf"),
      nodeId: "child",
      configuration: {
        workflowId: "leaf",
        mode: "batch",
        itemsPath: "orders",
        maxItems: 101,
      },
      contract: { version: 1, inputSchema, outputSchema },
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed indexed contracts before mutating the parent workflow", () => {
    const result = bindFlowcordiaSubflowNodeContract({
      workflow: callable("parent", "leaf"),
      nodeId: "child",
      configuration: { workflowId: "leaf", mode: "single" },
      contract: {
        version: 1,
        inputSchema: { type: "array", items: { type: "string" } },
        outputSchema,
      },
    });
    expect(result).toEqual({
      success: false,
      message: "The indexed child callable contract is invalid.",
    });
  });

  it("rejects stored child contracts that do not match the parent node", () => {
    const parent = callable("parent", "leaf");
    parent.nodes[1]!.outputSchema = { type: "object" };
    const issues = validateFlowcordiaSubflowContractBindings({
      workflow: parent,
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "leaf",
          status: "VALID",
          sourceCommitSha: commit,
          callableContractMetadataVersion: 1,
          callableContractState: "READY",
          callableInputSchema: inputSchema,
          callableOutputSchema: outputSchema,
          callableFailureMessage: null,
        },
      ],
    });
    expect(issues[0]?.code).toBe("contract_mismatch");
  });

  it("rejects unsynchronized stored child metadata", () => {
    const issues = validateFlowcordiaSubflowContractBindings({
      workflow: callable("parent", "leaf"),
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "leaf",
          status: "VALID",
          sourceCommitSha: commit,
          callableContractMetadataVersion: 0,
          callableContractState: "UNKNOWN",
          callableInputSchema: null,
          callableOutputSchema: null,
          callableFailureMessage: null,
        },
      ],
    });
    expect(issues[0]?.code).toBe("child_contract_blocked");
  });

  it("preserves a bounded indexed failure explanation for blocked children", () => {
    const issues = validateFlowcordiaSubflowContractBindings({
      workflow: callable("parent", "leaf"),
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "leaf",
          status: "VALID",
          sourceCommitSha: commit,
          callableContractMetadataVersion: 1,
          callableContractState: "BLOCKED",
          callableInputSchema: null,
          callableOutputSchema: null,
          callableFailureMessage: "The child output contract is unavailable.",
        },
      ],
    });
    expect(issues[0]).toMatchObject({
      code: "child_contract_blocked",
      message: "The child output contract is unavailable.",
    });
  });
});
