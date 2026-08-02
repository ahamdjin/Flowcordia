import { FlowActionType, FlowTriggerType, type FlowAction, type Step } from "@activepieces/shared";
import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";

import {
  flowcordiaWorkflowToActivepieces as legacyFlowcordiaWorkflowToActivepieces,
} from "./flowcordia-activepieces-bridge";
import {
  ACTIVEPIECES_GENERIC_ACTION_OPERATION,
  ACTIVEPIECES_GENERIC_TRIGGER_OPERATION,
  activepiecesFlowToFlowcordia,
  flowcordiaWorkflowToActivepieces,
} from "./flowcordia-activepieces-piece-bridge";

function findStep(step: Step, name: string): Step | undefined {
  if (step.name === name) return step;
  if (step.type === FlowActionType.ROUTER) {
    for (const child of step.children) {
      if (!child) continue;
      const found = findStep(child, name);
      if (found) return found;
    }
  }
  return step.nextAction ? findStep(step.nextAction, name) : undefined;
}

function persisted<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Flowcordia generic Activepieces piece bridge", () => {
  it("preserves an arbitrary Activepieces action without a per-piece Flowcordia mapping", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const flow = legacyFlowcordiaWorkflowToActivepieces({
      workflow,
      projectId: "project_test",
      now: "2026-08-02T00:00:00.000Z",
    });
    const action = findStep(flow.version.trigger, "http_request") as FlowAction;
    if (action.type !== FlowActionType.PIECE) throw new Error("Expected a piece action");

    const preservedSettings = {
      pieceName: "@activepieces/piece-slack",
      pieceVersion: "0.17.5",
      actionName: "send_message",
      input: {
        auth: "slack-main",
        channel: "C012345",
        text: "Hello from Flowcordia",
      },
      propertySettings: {
        channel: { type: "MANUAL" },
      },
      errorHandlingOptions: {
        continueOnFailure: { value: false },
        retryOnFailure: { value: true },
      },
    };
    action.settings = persisted(preservedSettings) as typeof action.settings;
    flow.version.connectionIds = ["fc_slack_main"];

    const canonical = activepiecesFlowToFlowcordia(flow);
    const node = canonical.nodes.find((candidate) => candidate.id === "http_request");
    expect(node).toMatchObject({
      kind: "action",
      operation: ACTIVEPIECES_GENERIC_ACTION_OPERATION,
      credentialReferences: ["fc_slack_main"],
    });
    expect(node?.configuration.activepieces).toEqual({
      stepType: "action",
      settings: preservedSettings,
    });

    const reloaded = flowcordiaWorkflowToActivepieces({
      workflow: canonical,
      projectId: "project_test",
      now: "2026-08-02T00:01:00.000Z",
    });
    const reloadedAction = findStep(reloaded.version.trigger, "http_request") as FlowAction;
    expect(reloadedAction.type).toBe(FlowActionType.PIECE);
    if (reloadedAction.type !== FlowActionType.PIECE) throw new Error("Expected a piece action");
    expect(persisted(reloadedAction.settings)).toEqual(preservedSettings);
    expect(reloaded.version.connectionIds).toContain("fc_slack_main");
  });

  it("preserves an arbitrary Activepieces trigger without replacing the Builder trigger UI", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const flow = legacyFlowcordiaWorkflowToActivepieces({
      workflow,
      projectId: "project_test",
      now: "2026-08-02T00:00:00.000Z",
    });

    const preservedSettings = {
      pieceName: "@activepieces/piece-webhook",
      pieceVersion: "0.1.0",
      triggerName: "catch_webhook",
      input: { authentication: "none" },
      propertySettings: {},
    };
    Object.assign(flow.version.trigger, {
      type: FlowTriggerType.PIECE,
      settings: persisted(preservedSettings),
    });

    const canonical = activepiecesFlowToFlowcordia(flow);
    const trigger = canonical.nodes.find((candidate) => candidate.id === "manual_trigger");
    expect(trigger).toMatchObject({
      kind: "trigger",
      operation: ACTIVEPIECES_GENERIC_TRIGGER_OPERATION,
    });
    expect(trigger?.configuration.activepieces).toEqual({
      stepType: "trigger",
      settings: preservedSettings,
    });

    const reloaded = flowcordiaWorkflowToActivepieces({
      workflow: canonical,
      projectId: "project_test",
      now: "2026-08-02T00:01:00.000Z",
    });
    expect(reloaded.version.trigger.type).toBe(FlowTriggerType.PIECE);
    expect(persisted(reloaded.version.trigger.settings)).toEqual(preservedSettings);
  });
});
