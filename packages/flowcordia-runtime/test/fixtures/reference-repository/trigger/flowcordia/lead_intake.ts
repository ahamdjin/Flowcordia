import { metadata, task, wait } from "@trigger.dev/sdk";
import {
  createTriggerRuntimeAdapters,
  executeFlowcordiaFunctionValidationSuite,
  executeFlowcordiaWorkflow,
} from "@flowcordia/runtime";
import type {
  FlowcordiaCodeHandler,
  FlowcordiaFunctionContract,
  FlowcordiaFunctionValidationCaseResult,
  FlowcordiaFunctionValidationDefinition,
  FlowcordiaFunctionValidationSuite,
} from "@flowcordia/runtime";
import type { WorkflowDefinition, JsonObject, JsonValue } from "@flowcordia/workflow";
import { qualifyLead as flowcordiaCode0 } from "../../src/functions/qualifyLead.ts";

const flowcordiaCode0Contract: FlowcordiaFunctionContract<typeof flowcordiaCode0> = flowcordiaCode0;

const flowcordiaCode0Handler: FlowcordiaCodeHandler = async (value) =>
  flowcordiaCode0Contract(value as Parameters<typeof flowcordiaCode0Contract>[0]);

const workflow = {
  edges: [
    {
      id: "manual_trigger_to_function_qualify_lead",
      source: "manual_trigger",
      target: "function_qualify_lead",
    },
    {
      id: "function_qualify_lead_to_output",
      source: "function_qualify_lead",
      target: "output",
    },
  ],
  id: "lead_intake",
  name: "Lead intake",
  nodes: [
    {
      configuration: {},
      id: "manual_trigger",
      kind: "trigger",
      operation: "trigger.manual",
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      configuration: {},
      id: "output",
      kind: "output",
      operation: "output.return",
      position: {
        x: 560,
        y: 0,
      },
    },
    {
      codeReference: {
        exportName: "qualifyLead",
        path: "src/functions/qualifyLead.ts",
      },
      configuration: {
        functionId: "qualify_lead",
      },
      id: "function_qualify_lead",
      inputSchema: {
        additionalProperties: false,
        properties: {
          leadId: {
            minLength: 1,
            type: "string",
          },
        },
        required: ["leadId"],
        type: "object",
      },
      kind: "code",
      name: "Qualify lead",
      operation: "code.task",
      outputSchema: {
        additionalProperties: false,
        properties: {
          qualified: {
            type: "boolean",
          },
        },
        required: ["qualified"],
        type: "object",
      },
      position: {
        x: 280,
        y: 0,
      },
    },
  ],
  schemaVersion: "0.1",
} as WorkflowDefinition;
const flowcordiaValidationDefinitions: Record<string, FlowcordiaFunctionValidationDefinition> = {
  qualify_lead: {
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["leadId"],
      properties: { leadId: { type: "string", minLength: 1 } },
    } as JsonObject,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["qualified"],
      properties: { qualified: { type: "boolean" } },
    } as JsonObject,
    handler: flowcordiaCode0Handler,
  },
};

const adapters = createTriggerRuntimeAdapters({
  codeHandlers: { function_qualify_lead: flowcordiaCode0Handler },
  wait: async (durationSeconds) => {
    await wait.for({ seconds: durationSeconds });
  },
  authorizeHttp: (url) => {
    const allowlist = (process.env.FLOWCORDIA_HTTP_HOST_ALLOWLIST ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    return url.protocol === "https:" && allowlist.includes(url.hostname.toLowerCase());
  },
  resolveCredential: async (reference) => {
    const bindings: Record<string, string> = {};
    const environmentName = bindings[reference];
    if (!environmentName) throw new Error(`Credential reference "${reference}" is not bound.`);
    const raw = process.env[environmentName];
    if (!raw) throw new Error(`Credential environment "${environmentName}" is unavailable.`);
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Credential environment "${environmentName}" must contain a JSON object.`);
    return value as JsonObject;
  },
});

export const lead_intakeTask = task({
  id: "flowcordia-lead_intake",
  run: async (payload: JsonValue) => {
    const flowcordiaNodeStates: Record<string, { operation: string; status: string }> = {};
    const result = await executeFlowcordiaWorkflow(workflow, payload, adapters, {
      onTrace: async (trace) => {
        flowcordiaNodeStates[trace.nodeId] = {
          operation: trace.operation,
          status: trace.status,
        };
        metadata.set("flowcordia", {
          schemaVersion: "0.1",
          workflowId: workflow.id,
          nodes: flowcordiaNodeStates,
          updatedAt: new Date().toISOString(),
        });
      },
    });
    if (!result.success)
      throw new Error(result.traces.at(-1)?.message ?? "Flowcordia workflow failed.");
    return result.output;
  },
});

export const lead_intakeValidationTask = task({
  id: "flowcordia-validate-lead_intake",
  run: async (payload: FlowcordiaFunctionValidationSuite) => {
    if (!payload || payload.workflowId !== workflow.id)
      throw new Error("Flowcordia function validation payload does not match this workflow.");
    const caseStates: FlowcordiaFunctionValidationCaseResult[] = [];
    const writeMetadata = (
      identity: { proposalId: string; headSha: string; suiteDigest: string },
      status: "RUNNING" | "PASSED" | "FAILED",
      passedCount: number,
      failedCount: number,
      failureCode: string | null = null
    ) => {
      metadata.set("flowcordiaValidation", {
        schemaVersion: "0.1",
        workflowId: workflow.id,
        proposalId: identity.proposalId,
        headSha: identity.headSha,
        suiteDigest: identity.suiteDigest,
        status,
        passedCount,
        failedCount,
        failureCode,
        cases: caseStates,
        updatedAt: new Date().toISOString(),
      });
    };
    const result = await executeFlowcordiaFunctionValidationSuite(
      payload,
      flowcordiaValidationDefinitions,
      {
        onCase: (caseResult) => {
          caseStates.push(caseResult);
          writeMetadata(
            payload,
            "RUNNING",
            caseStates.filter((candidate) => candidate.status === "PASSED").length,
            caseStates.filter((candidate) => candidate.status === "FAILED").length
          );
        },
      }
    );
    writeMetadata(
      result,
      result.success ? "PASSED" : "FAILED",
      result.passedCount,
      result.failedCount,
      result.failureCode ?? null
    );
    if (!result.success) throw new Error("Flowcordia repository function validation failed.");
    return result;
  },
});
