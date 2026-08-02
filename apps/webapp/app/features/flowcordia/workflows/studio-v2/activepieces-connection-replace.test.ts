import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { replaceStudioV2ActivepiecesConnectionReferences } from "./activepieces-connection-replace";

const workflow: WorkflowDefinition = {
  schemaVersion: "0.1",
  id: "replace_connection",
  name: "Replace connection",
  nodes: [
    {
      id: "manual",
      kind: "trigger",
      operation: "trigger.manual",
      position: { x: 0, y: 0 },
      configuration: {},
    },
    {
      id: "piece",
      kind: "action",
      operation: "activepieces.piece.action",
      position: { x: 0, y: 120 },
      configuration: {
        activepieces: {
          stepType: "action",
          settings: {
            pieceName: "@activepieces/piece-slack",
            pieceVersion: "0.17.5",
            actionName: "send_channel_message",
            input: {
              auth: "{{connections['slack-old']}}",
              nested: { auth: "prefix {{connections['slack-old']}} suffix" },
            },
            propertySettings: {},
          },
        },
      },
      credentialReferences: ["slack-old", "other"],
    },
  ],
  edges: [{ id: "edge", source: "manual", target: "piece" }],
};

describe("Studio V2 Activepieces connection replacement", () => {
  it("rewrites exact connection expressions and opaque credential references", () => {
    const result = replaceStudioV2ActivepiecesConnectionReferences({
      workflow,
      sourceExternalId: "slack-old",
      targetExternalId: "slack-new",
    });
    expect(result.replacements).toBe(3);
    expect(JSON.stringify(result.workflow)).not.toContain("slack-old");
    expect(JSON.stringify(result.workflow)).toContain("{{connections['slack-new']}}");
    expect(result.workflow.nodes[1]?.credentialReferences).toEqual(["slack-new", "other"]);
  });

  it("deduplicates credential references when the target already exists", () => {
    const input: WorkflowDefinition = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === "piece" ? { ...node, credentialReferences: ["slack-old", "slack-new"] } : node
      ),
    };
    const result = replaceStudioV2ActivepiecesConnectionReferences({
      workflow: input,
      sourceExternalId: "slack-old",
      targetExternalId: "slack-new",
    });
    expect(result.workflow.nodes[1]?.credentialReferences).toEqual(["slack-new"]);
  });

  it("rejects self replacement", () => {
    expect(() =>
      replaceStudioV2ActivepiecesConnectionReferences({
        workflow,
        sourceExternalId: "slack-old",
        targetExternalId: "slack-old",
      })
    ).toThrow("Cannot replace an Activepieces connection with itself");
  });
});
