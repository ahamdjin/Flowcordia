import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { studioV2CredentialRequirements } from "./release-credentials";

function workflow(nodes: WorkflowDefinition["nodes"]): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "credential-workflow",
    name: "Credential workflow",
    nodes,
    edges: [],
    metadata: {},
  };
}

const position = { x: 0, y: 0 };

describe("Studio V2 release credential requirements", () => {
  it("deduplicates references and uses runtime environment names", () => {
    const result = studioV2CredentialRequirements(
      workflow([
        {
          id: "manual",
          name: "Manual",
          kind: "trigger",
          operation: "trigger.manual",
          position,
          configuration: {},
        },
        {
          id: "http",
          name: "HTTP",
          kind: "action",
          operation: "action.http",
          position,
          configuration: {},
          credentialReferences: ["api-token", "api-token"],
        },
      ])
    );

    expect(result).toEqual({
      success: true,
      requirements: [
        { reference: "api-token", environmentName: "FLOWCORDIA_CREDENTIAL_API_TOKEN" },
      ],
    });
  });

  it("rejects one reference shared by webhook and header credentials", () => {
    const result = studioV2CredentialRequirements(
      workflow([
        {
          id: "webhook",
          name: "Webhook",
          kind: "trigger",
          operation: "trigger.webhook",
          position,
          configuration: {},
          credentialReferences: ["shared"],
        },
        {
          id: "http",
          name: "HTTP",
          kind: "action",
          operation: "action.http",
          position,
          configuration: {},
          credentialReferences: ["shared"],
        },
      ])
    );

    expect(result).toEqual({ success: false, reference: "shared" });
  });
});
