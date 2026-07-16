import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  addWorkflowFunctionNode,
  applyWorkflowEdit,
  parseWorkflowFunctionCatalog,
  validateWorkflow,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  compileWorkflowToTriggerTask,
  createPreviewRuntimeAdapters,
  createTriggerRuntimeAdapters,
  executeFlowcordiaWorkflow,
  type FlowcordiaCodeHandler,
} from "../src/index.js";
import { qualifyLead } from "./fixtures/reference-repository/src/functions/qualifyLead.js";

const fixtureRoot = fileURLToPath(
  new URL("./fixtures/reference-repository/", import.meta.url)
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(`${fixtureRoot}/${path}`, "utf8")) as unknown;
}

function referenceDraft(): WorkflowDefinition {
  const catalog = parseWorkflowFunctionCatalog(readJson(".flowcordia/functions.json"));
  if (!catalog.success) throw new Error(catalog.issues[0]?.message ?? "Invalid fixture catalog.");
  const workflow = validateWorkflow(readJson(".flowcordia/workflows/lead_intake.json"));
  if (!workflow.success) throw new Error(workflow.issues[0]?.message ?? "Invalid fixture workflow.");

  const added = addWorkflowFunctionNode(
    workflow.workflow,
    catalog.catalog.functions[0]!,
    { x: 280, y: 0 }
  );
  if (!added.success) throw new Error(added.message);
  const withoutDirectEdge = applyWorkflowEdit(added.workflow, {
    type: "remove_edge",
    edgeId: "manual_trigger_to_output",
  });
  if (!withoutDirectEdge.success) throw new Error(withoutDirectEdge.message);
  const triggerConnected = applyWorkflowEdit(withoutDirectEdge.workflow, {
    type: "connect_nodes",
    source: "manual_trigger",
    target: "function_qualify_lead",
  });
  if (!triggerConnected.success) throw new Error(triggerConnected.message);
  const outputConnected = applyWorkflowEdit(triggerConnected.workflow, {
    type: "connect_nodes",
    source: "function_qualify_lead",
    target: "output",
  });
  if (!outputConnected.success) throw new Error(outputConnected.message);
  return outputConnected.workflow;
}

describe("reference repository vertical flow", () => {
  it("proves catalog to draft to preview to generated artifact to live function execution", async () => {
    const workflow = referenceDraft();

    const preview = await executeFlowcordiaWorkflow(
      workflow,
      { leadId: "lead_qualified" },
      createPreviewRuntimeAdapters()
    );
    expect(preview).toMatchObject({ success: true, output: { qualified: false } });

    const compilation = compileWorkflowToTriggerTask(workflow);
    expect(compilation.success).toBe(true);
    if (!compilation.success) return;
    expect(compilation.artifact.source).toBe(
      readFileSync(`${fixtureRoot}/trigger/flowcordia/lead_intake.ts`, "utf8")
    );

    const handler: FlowcordiaCodeHandler = async (value) =>
      qualifyLead(value as Parameters<typeof qualifyLead>[0]);
    const live = await executeFlowcordiaWorkflow(
      workflow,
      { leadId: "lead_qualified" },
      createTriggerRuntimeAdapters({
        codeHandlers: { function_qualify_lead: handler },
        wait: async () => undefined,
        authorizeHttp: () => true,
      })
    );
    expect(live).toMatchObject({ success: true, output: { qualified: true } });

    const removed = applyWorkflowEdit(workflow, {
      type: "remove_node",
      nodeId: "function_qualify_lead",
    });
    expect(removed.success).toBe(true);
    if (!removed.success) return;
    expect(removed.workflow.nodes.map((node) => node.id)).toEqual([
      "manual_trigger",
      "output",
    ]);
    expect(removed.workflow.edges).toEqual([]);
  });
});
