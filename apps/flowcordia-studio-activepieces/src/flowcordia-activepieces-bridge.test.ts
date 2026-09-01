import { FlowActionType, PopulatedFlow, type FlowAction, type Step } from "@activepieces/shared";
import {
  createStudioV2VerticalSliceWorkflow,
  type JsonObject,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
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
  if (step.type === FlowActionType.LOOP_ON_ITEMS && step.firstLoopAction) {
    const found = findStep(step.firstLoopAction, name);
    if (found) return found;
  }
  return step.nextAction ? findStep(step.nextAction, name) : undefined;
}

function persisted<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Flowcordia Activepieces bridge", () => {
  it("creates an actual Activepieces flow and round-trips the persisted canonical workflow", () => {
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
    expect(persisted(roundTripped)).toEqual(persisted(workflow));
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

  it("creates a complete Flowcordia Source contract for a newly added Activepieces code step", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const flow = flowcordiaWorkflowToActivepieces({
      workflow,
      projectId: "project_test",
      now: "2026-07-31T00:00:00.000Z",
    });
    const source = findStep(flow.version.trigger, "source") as FlowAction;
    if (source.type !== FlowActionType.CODE) throw new Error("Expected Source to be a code action");

    source.name = "new_source";
    source.displayName = "New Source";
    source.settings.sourceCode.code = `export default async function run(ctx: FlowcordiaContext) {
  return { input: ctx.input };
}`;

    const updated = activepiecesFlowToFlowcordia(flow);
    const node = updated.nodes.find((candidate) => candidate.id === "new_source");
    expect(node).toMatchObject({
      kind: "code",
      operation: "code.typescript",
      credentialReferences: [],
      configuration: {
        language: "typescript",
        entrypoint: "run",
        credentialReferences: [],
      },
    });
    expect(node?.configuration.source).toContain("function run(ctx: FlowcordiaContext)");
  });

  it("preserves an Activepieces loop body as a bounded nested Flowcordia workflow", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const body: WorkflowDefinition = {
      schemaVersion: "0.1",
      id: "request_loop_body",
      name: "Request loop body",
      nodes: [
        {
          id: "loop_iteration",
          kind: "trigger",
          operation: "trigger.manual",
          position: { x: 0, y: 0 },
          configuration: {},
        },
        {
          id: "loop_request",
          kind: "action",
          operation: "action.http",
          position: { x: 280, y: 0 },
          configuration: { method: "POST", url: "https://example.test/items" },
        },
      ],
      edges: [
        {
          id: "iteration_to_request",
          source: "loop_iteration",
          target: "loop_request",
        },
      ],
    };
    workflow.nodes.splice(1, 0, {
      id: "request_loop",
      name: "Request loop",
      kind: "control",
      operation: "control.loop",
      position: { x: 200, y: 0 },
      configuration: {
        itemsExpression: "{{manual_trigger.output.items}}",
        maxIterations: 20,
        body: body as unknown as JsonObject,
      },
    });
    workflow.edges[0]!.target = "request_loop";
    workflow.edges.splice(1, 0, {
      id: "loop_to_source",
      source: "request_loop",
      target: "source",
    });

    const flow = flowcordiaWorkflowToActivepieces({
      workflow,
      projectId: "project_test",
      now: "2026-08-09T00:00:00.000Z",
    });
    const loop = findStep(flow.version.trigger, "request_loop") as FlowAction;
    expect(loop.type).toBe(FlowActionType.LOOP_ON_ITEMS);
    if (loop.type !== FlowActionType.LOOP_ON_ITEMS) throw new Error("Expected a loop action");
    expect(loop.settings.items).toBe("{{manual_trigger.output.items}}");
    expect(loop.firstLoopAction?.name).toBe("loop_request");

    const roundTripped = activepiecesFlowToFlowcordia(flow);
    expect(persisted(roundTripped)).toEqual(persisted(workflow));
  });

  it.each([
    {
      name: "Delay For",
      configuration: { mode: "duration", durationSeconds: 90 },
      actionName: "delayFor",
      input: { unit: "seconds", delayFor: 90 },
    },
    {
      name: "Delay Until",
      configuration: { mode: "until", untilTimestamp: "2026-09-02T09:30:00.000Z" },
      actionName: "delay_until",
      input: { delayUntilTimestamp: "2026-09-02T09:30:00.000Z" },
    },
  ])("round-trips $name as the native Activepieces delay piece", (example) => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    workflow.nodes.splice(1, 0, {
      id: "wait",
      name: example.name,
      kind: "control",
      operation: "control.wait",
      position: { x: 200, y: 0 },
      configuration: example.configuration as unknown as JsonObject,
    });
    workflow.edges[0]!.target = "wait";
    workflow.edges.splice(1, 0, {
      id: "wait_to_source",
      source: "wait",
      target: "source",
    });

    const flow = flowcordiaWorkflowToActivepieces({
      workflow,
      projectId: "project_test",
      now: "2026-09-01T00:00:00.000Z",
    });
    const wait = findStep(flow.version.trigger, "wait") as FlowAction;
    expect(wait).toMatchObject({
      type: FlowActionType.PIECE,
      settings: {
        pieceName: "@activepieces/piece-delay",
        actionName: example.actionName,
        input: example.input,
      },
    });

    expect(persisted(activepiecesFlowToFlowcordia(flow))).toEqual(persisted(workflow));
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
