import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { compileWorkflowToTriggerTask } from "../src/index.js";

function workflow(reference: string): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "credential_flow",
    name: "Credential flow",
    nodes: [
      {
        id: "start",
        name: "Start",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "request",
        name: "Request",
        kind: "action",
        operation: "action.http",
        position: { x: 240, y: 0 },
        configuration: { method: "POST", url: "https://api.example.com" },
        credentialReferences: [reference],
      },
      {
        id: "output",
        name: "Output",
        kind: "output",
        operation: "output.return",
        position: { x: 480, y: 0 },
        configuration: {},
      },
    ],
    edges: [
      { id: "start_to_request", source: "start", target: "request" },
      { id: "request_to_output", source: "request", target: "output" },
    ],
  };
}

describe("Flowcordia credential compilation", () => {
  it("binds a reviewed reference to one deterministic environment key", () => {
    const result = compileWorkflowToTriggerTask(workflow("billing-api"));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artifact.source).toContain(
      'const bindings: Record<string, string> = {"billing-api":"FLOWCORDIA_CREDENTIAL_BILLING_API"};'
    );
    expect(result.artifact.source).not.toContain("Bearer");
    expect(result.artifact.source).not.toContain('authorization":');
  });

  it("rejects invalid reference names before generating source", () => {
    const result = compileWorkflowToTriggerTask(workflow("Legacy_Key"));
    expect(result).toMatchObject({ success: false });
    if (result.success) return;
    expect(result.issues[0]?.message).toContain("Credential references must be");
  });
});
