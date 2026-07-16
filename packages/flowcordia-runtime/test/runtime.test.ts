import type { WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it, vi } from "vitest";
import {
  compileWorkflowToTriggerTask,
  createPreviewRuntimeAdapters,
  createTriggerRuntimeAdapters,
  executeFlowcordiaWorkflow,
} from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "lead_intake",
    name: "Lead intake",
    nodes: [
      {
        id: "manual_trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "crm_request",
        kind: "action",
        operation: "action.http",
        position: { x: 280, y: 0 },
        configuration: { method: "POST", url: "https://example.test/leads" },
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 560, y: 0 },
        configuration: {},
      },
    ],
    edges: [
      { id: "trigger_to_crm", source: "manual_trigger", target: "crm_request" },
      { id: "crm_to_output", source: "crm_request", target: "output" },
    ],
  };
}

describe("Flowcordia runtime", () => {
  it("runs a safe preview without making the HTTP request", async () => {
    const observed: string[] = [];
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { leadId: "lead_123" },
      createPreviewRuntimeAdapters(),
      { onTrace: (trace) => observed.push(`${trace.nodeId}:${trace.status}`) }
    );

    expect(result.success).toBe(true);
    expect(result.traces.map((trace) => [trace.nodeId, trace.status])).toEqual([
      ["manual_trigger", "SUCCEEDED"],
      ["crm_request", "SUCCEEDED"],
      ["output", "SUCCEEDED"],
    ]);
    expect(result.output).toMatchObject({
      simulated: true,
      request: { method: "POST", url: "https://example.test/leads" },
    });
    expect(observed).toEqual([
      "manual_trigger:SUCCEEDED",
      "crm_request:SUCCEEDED",
      "output:SUCCEEDED",
    ]);
  });

  it("does not let a trace observer change workflow behavior", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { leadId: "lead_123" },
      createPreviewRuntimeAdapters(),
      {
        onTrace() {
          throw new Error("metadata transport unavailable");
        },
      }
    );

    expect(result.success).toBe(true);
    expect(result.traces).toHaveLength(3);
  });

  it("compiles the same workflow into a deterministic Trigger.dev task", () => {
    const first = compileWorkflowToTriggerTask(workflow());
    const second = compileWorkflowToTriggerTask(workflow());
    expect(first).toEqual(second);
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.artifact.taskId).toBe("flowcordia-lead_intake");
    expect(first.artifact.source).toContain("executeFlowcordiaWorkflow");
    expect(first.artifact.source).toContain("await wait.for");
    expect(first.artifact.source).toContain('metadata.set("flowcordia"');
    expect(first.artifact.source).not.toContain("trace.message");
    expect(first.artifact.orderedNodeIds).toEqual(["manual_trigger", "crm_request", "output"]);
  });

  it("blocks invalid runtime configuration before deployment", () => {
    const source = workflow();
    source.nodes[1]!.configuration = { method: "POST", url: "" };
    const result = compileWorkflowToTriggerTask(source);
    expect(result).toMatchObject({
      success: false,
      issues: [{ code: "invalid_configuration", nodeId: "crm_request" }],
    });
  });

  it("blocks inline secrets before proposal publication", () => {
    const source = workflow();
    source.nodes[1]!.configuration.apiKey = "secret-value";
    const result = compileWorkflowToTriggerTask(source);
    expect(result).toMatchObject({
      success: false,
      issues: [{ code: "invalid_configuration", nodeId: "crm_request" }],
    });
  });

  it("executes only the matching structured condition branch", async () => {
    const source = workflow();
    source.nodes.splice(1, 0, {
      id: "qualified",
      kind: "control",
      operation: "control.condition",
      position: { x: 200, y: 0 },
      configuration: { path: "qualified", operator: "equals", value: true },
    });
    source.nodes[2]!.id = "accepted";
    source.nodes[2]!.configuration = {
      method: "POST",
      url: "https://example.test/accepted",
    };
    source.nodes.push({
      id: "rejected",
      kind: "output",
      operation: "output.return",
      position: { x: 500, y: 160 },
      configuration: {},
    });
    source.edges = [
      { id: "trigger_to_condition", source: "manual_trigger", target: "qualified" },
      { id: "accepted_branch", source: "qualified", target: "accepted", condition: "true" },
      { id: "rejected_branch", source: "qualified", target: "rejected", condition: "false" },
      { id: "accepted_to_output", source: "accepted", target: "output" },
    ];

    const result = await executeFlowcordiaWorkflow(
      source,
      { qualified: true },
      createPreviewRuntimeAdapters()
    );

    expect(result.success).toBe(true);
    expect(result.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: "accepted",
          status: "SUCCEEDED",
          output: expect.objectContaining({ input: { qualified: true } }),
        }),
        expect.objectContaining({ nodeId: "rejected", status: "SKIPPED" }),
      ])
    );
  });

  it("rejects ambiguous condition branches before execution", () => {
    const source = workflow();
    source.nodes.splice(1, 0, {
      id: "qualified",
      kind: "control",
      operation: "control.condition",
      position: { x: 200, y: 0 },
      configuration: { path: "qualified", operator: "equals", value: true },
    });
    source.edges = [
      { id: "trigger_to_condition", source: "manual_trigger", target: "qualified" },
      { id: "condition_to_crm", source: "qualified", target: "crm_request" },
      { id: "crm_to_output", source: "crm_request", target: "output" },
    ];

    expect(compileWorkflowToTriggerTask(source)).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ nodeId: "qualified", code: "invalid_configuration" })],
    });
  });

  it("compiles repository code references relative to the generated artifact", () => {
    const source = workflow();
    source.nodes[1] = {
      id: "qualify",
      kind: "code",
      operation: "code.task",
      position: { x: 280, y: 0 },
      configuration: {},
      codeReference: { path: "src/tasks/qualify.ts", exportName: "qualifyLead" },
    };
    source.edges[0]!.target = "qualify";
    source.edges[1]!.source = "qualify";

    const result = compileWorkflowToTriggerTask(source);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artifact.source).toContain(
      'import { qualifyLead as flowcordiaCode0 } from "../../src/tasks/qualify.ts";'
    );
  });

  it("rejects executable code-reference injection", () => {
    const source = workflow();
    source.nodes[1] = {
      id: "qualify",
      kind: "code",
      operation: "code.task",
      position: { x: 280, y: 0 },
      configuration: {},
      codeReference: { path: "src/tasks/qualify.ts", exportName: "qualifyLead as injected" },
    };
    source.edges[0]!.target = "qualify";
    source.edges[1]!.source = "qualify";

    expect(compileWorkflowToTriggerTask(source)).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ nodeId: "qualify", code: "invalid_configuration" })],
    });
  });

  it("resolves header-only credentials without exposing them in workflow output", async () => {
    const source = workflow();
    source.nodes[1]!.credentialReferences = ["orders-api"];
    const fetch = vi.fn(async () =>
      Promise.resolve(new Response('{"accepted":true}', { status: 200 }))
    );

    const result = await executeFlowcordiaWorkflow(
      source,
      { leadId: "lead_123" },
      createTriggerRuntimeAdapters({
        fetch,
        wait: async () => undefined,
        authorizeHttp: () => true,
        resolveCredential: async () => ({
          headers: { authorization: "Bearer runtime-secret" },
        }),
      })
    );

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://example.test/leads"),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer runtime-secret" }),
      })
    );
    expect(JSON.stringify(result)).not.toContain("runtime-secret");
  });

  it("binds credential references to deterministic environment names", () => {
    const source = workflow();
    source.nodes[1]!.credentialReferences = ["orders-api"];

    const result = compileWorkflowToTriggerTask(source);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artifact.source).toContain("FLOWCORDIA_CREDENTIAL_ORDERS_API");
    expect(result.artifact.source).not.toContain("runtime-secret");
  });

  it("rejects credential references with colliding environment bindings", () => {
    const source = workflow();
    source.nodes[1]!.credentialReferences = ["orders-api", "orders_api"];

    expect(compileWorkflowToTriggerTask(source)).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ code: "invalid_configuration" })],
    });
  });
});
