import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  addWorkflowFunctionNode,
  applyWorkflowEdit,
  parseWorkflowFunctionCatalog,
  validateWorkflow,
  type WorkflowDefinition,
  type WorkflowFunctionCatalog,
} from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  compileWorkflowToTriggerTask,
  createPreviewRuntimeAdapters,
  createTriggerRuntimeAdapters,
  executeFlowcordiaFunctionValidationSuite,
  executeFlowcordiaWorkflow,
  flowcordiaFunctionValidationSuiteDigest,
  type FlowcordiaCodeHandler,
  type FlowcordiaFunctionValidationDefinition,
  type FlowcordiaFunctionValidationSuite,
} from "../src/index.js";
import { qualifyLead } from "./fixtures/reference-repository/src/functions/qualifyLead.js";

const fixtureRoot = fileURLToPath(new URL("./fixtures/reference-repository/", import.meta.url));

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(`${fixtureRoot}/${path}`, "utf8")) as unknown;
}

function referenceCatalog(): WorkflowFunctionCatalog {
  const catalog = parseWorkflowFunctionCatalog(readJson(".flowcordia/functions.json"));
  if (!catalog.success) throw new Error(catalog.issues[0]?.message ?? "Invalid fixture catalog.");
  return catalog.catalog;
}

function referenceDraft(): WorkflowDefinition {
  const catalog = referenceCatalog();
  const workflow = validateWorkflow(readJson(".flowcordia/workflows/lead_intake.json"));
  if (!workflow.success)
    throw new Error(workflow.issues[0]?.message ?? "Invalid fixture workflow.");

  const added = addWorkflowFunctionNode(workflow.workflow, catalog.functions[0]!, {
    x: 280,
    y: 0,
  });
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

function expectTypedFunctionArtifact(source: string) {
  expect(source).toContain(
    'import { qualifyLead as flowcordiaCode0 } from "../../src/functions/qualifyLead.ts";'
  );
  expect(source).toContain("FlowcordiaFunctionContract<typeof flowcordiaCode0>");
  expect(source).toContain("const flowcordiaCode0Handler: FlowcordiaCodeHandler");
  expect(source).toMatch(
    /codeHandlers:\s*\{\s*"?function_qualify_lead"?:\s*flowcordiaCode0Handler\s*\}/
  );
  expect(source).toContain('id: "flowcordia-lead_intake"');
  expect(source).toContain("executeFlowcordiaWorkflow(workflow, payload, adapters");
  expect(source).toContain('id: "flowcordia-validate-lead_intake"');
  expect(source).toContain("executeFlowcordiaFunctionValidationSuite");
  expect(source).toMatch(/"?qualify_lead"?:\s*\{/);
  expect(source).toContain("handler: flowcordiaCode0Handler");
  expect(source).not.toContain("lead_123");
  expect(source).not.toContain("qualified_lead");
}

describe("reference repository vertical flow", () => {
  it("proves catalog to draft to preview to generated artifact to live function validation", async () => {
    const catalog = referenceCatalog();
    const definition = catalog.functions[0]!;
    const fixture = definition.fixtures![0]!;
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
    expect(compilation.artifact.validationTaskId).toBe("flowcordia-validate-lead_intake");
    expectTypedFunctionArtifact(compilation.artifact.source);

    const generatedFixture = readFileSync(
      `${fixtureRoot}/trigger/flowcordia/lead_intake.ts`,
      "utf8"
    );
    expectTypedFunctionArtifact(generatedFixture);

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

    const suiteContent = {
      schemaVersion: "0.1" as const,
      workflowId: workflow.id,
      proposalId: "studio-s-reference",
      headSha: "a".repeat(40),
      cases: [
        {
          functionId: definition.id,
          fixtureId: fixture.id,
          input: fixture.input,
          expectedOutput: fixture.mockOutput,
        },
      ],
    };
    const suite: FlowcordiaFunctionValidationSuite = {
      ...suiteContent,
      suiteDigest: flowcordiaFunctionValidationSuiteDigest(suiteContent),
    };
    const definitions: Record<string, FlowcordiaFunctionValidationDefinition> = {
      [definition.id]: {
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        handler,
      },
    };
    const validation = await executeFlowcordiaFunctionValidationSuite(suite, definitions);
    expect(validation).toMatchObject({
      success: true,
      passedCount: 1,
      failedCount: 0,
      cases: [{ functionId: "qualify_lead", fixtureId: "qualified_lead", status: "PASSED" }],
    });
    expect(JSON.stringify(validation)).not.toContain("lead_123");
    expect(JSON.stringify(validation)).not.toContain('qualified":true');

    const removed = applyWorkflowEdit(workflow, {
      type: "remove_node",
      nodeId: "function_qualify_lead",
    });
    expect(removed.success).toBe(true);
    if (!removed.success) return;
    expect(removed.workflow.nodes.map((node) => node.id)).toEqual(["manual_trigger", "output"]);
    expect(removed.workflow.edges).toEqual([]);
  });
});
