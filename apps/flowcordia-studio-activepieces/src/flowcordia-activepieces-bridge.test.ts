import { FlowActionType, PopulatedFlow, type FlowAction, type Step } from "@activepieces/shared";
import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_BACKUP_FILE,
  FlowcordiaActivepiecesBridgeError,
  activepiecesFlowToFlowcordia,
  flowcordiaWorkflowToActivepieces,
} from "./flowcordia-activepieces-bridge";

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

describe("Flowcordia Activepieces bridge", () => {
  it("creates an actual Activepieces flow and round-trips the canonical workflow", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const flow = flowcordiaWorkflowToActivepieces({
      workflow,
      projectId: "project_test",
      now: "2026-07-31T00:00:00.000Z",
    });

    expect(PopulatedFlow.safeParse(flow).success).toBe(true);
    expect(flow.version.backupFiles?.[FLOWCORDIA_BACKUP_FILE]).toContain(workflow.id);
    expect(flow.version.trigger.name).toBe("manual_trigger");
    expect(findStep(flow.version.trigger, "source")?.type).toBe(FlowActionType.CODE);
    expect(findStep(flow.version.trigger, "http_request")?.type).toBe(FlowActionType.PIECE);
    expect(findStep(flow.version.trigger, "condition")?.type).toBe(FlowActionType.ROUTER);

    const roundTripped = activepiecesFlowToFlowcordia(flow);
    expect(roundTripped.nodes).toEqual(workflow.nodes);
    expect(roundTripped.edges).toEqual(workflow.edges);
    expect(roundTripped.id).toBe(workflow.id);
    expect(roundTripped.name).toBe(workflow.name);
  });

  it("reflects Source edits from the Activepieces code editor into the Flowcordia node", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const flow = flowcordiaWorkflowToActivepieces({
      workflow,
      projectId: "project_test",
      now: "2026-07-31T00:00:00.000Z",
    });
    const source = findStep(flow.version.trigger, "source") as FlowAction;
    if (source.type !== FlowActionType.CODE) throw new Error("Expected Source to be a code action");

    source.settings.sourceCode.code = `export default async function run(ctx: FlowcordiaContext) {
  return { changed: true, input: ctx.input };
}`;

    const updated = activepiecesFlowToFlowcordia(flow);
    expect(updated.nodes.find((node) => node.id === "source")?.configuration.source).toContain(
      "changed: true"
    );
  });

  it("fails atomically when a Flowcordia graph join cannot be represented losslessly", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    workflow.edges.push({
      id: "manual_to_http_join",
      source: "manual_trigger",
      target: "http_request",
    });

    expect(() =>
      flowcordiaWorkflowToActivepieces({ workflow, projectId: "project_test" })
    ).toThrowError(FlowcordiaActivepiecesBridgeError);
  });
});
