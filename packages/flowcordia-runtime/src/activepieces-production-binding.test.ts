import type { WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { compileWorkflowToTriggerTask } from "./compiler.js";

function activepiecesWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "slack_events",
    name: "Slack events",
    nodes: [
      {
        id: "slack_trigger",
        kind: "trigger",
        operation: "activepieces.piece.trigger",
        position: { x: 0, y: 0 },
        configuration: {
          activepieces: {
            stepType: "trigger",
            settings: {
              pieceName: "@activepieces/piece-slack",
              pieceVersion: "~0.16.4",
              triggerName: "new-message",
              input: { channel: "C123" },
              propertySettings: {},
            },
          },
        },
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 280, y: 0 },
        configuration: {},
      },
    ],
    edges: [{ id: "trigger_to_output", source: "slack_trigger", target: "output" }],
  };
}

describe("Activepieces production trigger binding", () => {
  it("persists the exact trigger identity in the immutable compilation artifact", () => {
    const result = compileWorkflowToTriggerTask(activepiecesWorkflow());
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.artifact.triggerBinding).toEqual({
      kind: "activepieces",
      nodeId: "slack_trigger",
      taskId: "flowcordia-slack_events",
      scheduleTaskId: "flowcordia-slack_events-activepieces-schedule",
      pieceName: "@activepieces/piece-slack",
      pieceVersion: "0.16.4",
      triggerName: "new-message",
      input: { channel: "C123" },
      propertySettings: {},
    });
    expect(result.artifact.warnings).not.toContain(
      "activepieces.piece.trigger requires a deployment binding before it can receive production events."
    );
    expect(result.artifact.source).toContain('id: "flowcordia-slack_events-activepieces-schedule"');
    expect(result.artifact.source).toContain("queue: { concurrencyLimit: 1 }");
    expect(result.artifact.source).toContain("retry: { maxAttempts: 3 }");
    expect(result.artifact.source).toContain("process.env.TRIGGER_API_URL");
    expect(result.artifact.source).toContain("process.env.TRIGGER_SECRET_KEY");
    expect(result.artifact.source).not.toContain("process.env.APP_ORIGIN");
    expect(result.artifact.source).toContain("authorization: `Bearer ${token}`");
    expect(result.artifact.source).toContain('redirect: "error"');
    expect(result.artifact.source).toContain(
      "/api/v1/flowcordia/activepieces/production-schedules/flowcordia-slack_events-activepieces-schedule"
    );
    expect(result.artifact.source).not.toContain("setInterval(");
    expect(result.artifact.source).not.toContain("setTimeout(");
  });
});
