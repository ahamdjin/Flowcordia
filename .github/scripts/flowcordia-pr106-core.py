from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} occurrence(s), found {actual}: {old[:120]!r}")
    file.write_text(text.replace(old, new))


def write(path: str, content: str) -> None:
    file = Path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content)


write(
    "packages/flowcordia-workflow/src/approval.ts",
    '''import type { JsonObject, JsonValue } from "./types.js";

export const FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS = 60;
export const FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS = 30 * 24 * 60 * 60;
export const FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH = 500;
export const FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH = 2_000;
export const FLOWCORDIA_APPROVAL_MAX_COMMENT_LENGTH = 2_000;

export interface FlowcordiaApprovalConfiguration extends JsonObject {
  prompt: string;
  instruction: string;
  timeoutSeconds: number;
  requireComment: boolean;
}

export interface FlowcordiaApprovalResult extends JsonObject {
  decision: "approved" | "rejected";
  comment: string | null;
  decidedAt: string;
}

export type FlowcordiaApprovalConfigurationResult =
  | { success: true; configuration: FlowcordiaApprovalConfiguration }
  | { success: false; issues: Array<{ path: string; message: string }> };

export type FlowcordiaApprovalResultParseResult =
  | { success: true; result: FlowcordiaApprovalResult }
  | { success: false; message: string };

function isObject(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value: Record<string, JsonValue>, allowed: readonly string[]): string[] {
  const known = new Set(allowed);
  return Object.keys(value).filter((key) => !known.has(key));
}

export function parseFlowcordiaApprovalConfiguration(
  value: JsonObject
): FlowcordiaApprovalConfigurationResult {
  const issues: Array<{ path: string; message: string }> = [];
  const unknown = unknownKeys(value, ["prompt", "instruction", "timeoutSeconds", "requireComment"]);
  if (unknown.length > 0) {
    issues.push({ path: unknown[0]!, message: "Approval configuration contains an unsupported field." });
  }
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt || prompt.length > FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH) {
    issues.push({
      path: "prompt",
      message: `Approval prompt must contain 1-${FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH} characters.`,
    });
  }
  const instruction = typeof value.instruction === "string" ? value.instruction.trim() : "";
  if (instruction.length > FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH) {
    issues.push({
      path: "instruction",
      message: `Approval instruction must stay under ${FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH} characters.`,
    });
  }
  const timeoutSeconds = value.timeoutSeconds;
  if (
    typeof timeoutSeconds !== "number" ||
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS ||
    timeoutSeconds > FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS
  ) {
    issues.push({
      path: "timeoutSeconds",
      message: `Approval timeout must be an integer between ${FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS} and ${FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS} seconds.`,
    });
  }
  if (typeof value.requireComment !== "boolean") {
    issues.push({ path: "requireComment", message: "Approval requireComment must be a boolean." });
  }
  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    configuration: {
      prompt,
      instruction,
      timeoutSeconds: timeoutSeconds as number,
      requireComment: value.requireComment as boolean,
    },
  };
}

export function parseFlowcordiaApprovalResult(value: unknown): FlowcordiaApprovalResultParseResult {
  if (!isObject(value)) return { success: false, message: "Approval result must be a JSON object." };
  const unknown = unknownKeys(value, ["decision", "comment", "decidedAt"]);
  if (unknown.length > 0) {
    return { success: false, message: "Approval result contains an unsupported field." };
  }
  if (value.decision !== "approved" && value.decision !== "rejected") {
    return { success: false, message: "Approval result decision must be approved or rejected." };
  }
  if (
    value.comment !== null &&
    (typeof value.comment !== "string" || value.comment.length > FLOWCORDIA_APPROVAL_MAX_COMMENT_LENGTH)
  ) {
    return { success: false, message: "Approval result comment is invalid." };
  }
  if (typeof value.decidedAt !== "string" || !Number.isFinite(Date.parse(value.decidedAt))) {
    return { success: false, message: "Approval result decidedAt must be an ISO timestamp." };
  }
  return {
    success: true,
    result: {
      decision: value.decision,
      comment: value.comment,
      decidedAt: new Date(value.decidedAt).toISOString(),
    },
  };
}
''',
)

write(
    "packages/flowcordia-workflow/test/approval.test.ts",
    '''import { describe, expect, it } from "vitest";
import {
  parseFlowcordiaApprovalConfiguration,
  parseFlowcordiaApprovalResult,
  WORKFLOW_STUDIO_NODE_TEMPLATES,
} from "../src/index.js";

describe("Flowcordia human approval contract", () => {
  it("normalizes one bounded approval configuration", () => {
    expect(
      parseFlowcordiaApprovalConfiguration({
        prompt: "  Approve this order?  ",
        instruction: "  Check the refund amount. ",
        timeoutSeconds: 86_400,
        requireComment: true,
      })
    ).toEqual({
      success: true,
      configuration: {
        prompt: "Approve this order?",
        instruction: "Check the refund amount.",
        timeoutSeconds: 86_400,
        requireComment: true,
      },
    });
  });

  it("rejects unknown fields and unsafe approval bounds", () => {
    for (const value of [
      { prompt: "", instruction: "", timeoutSeconds: 86_400, requireComment: false },
      { prompt: "Approve", instruction: "", timeoutSeconds: 59, requireComment: false },
      { prompt: "Approve", instruction: "", timeoutSeconds: 86_400, requireComment: "yes" },
      {
        prompt: "Approve",
        instruction: "",
        timeoutSeconds: 86_400,
        requireComment: false,
        callbackUrl: "https://unsafe.example.com",
      },
    ]) {
      expect(parseFlowcordiaApprovalConfiguration(value as never).success).toBe(false);
    }
  });

  it("accepts only strict approval decision output", () => {
    expect(
      parseFlowcordiaApprovalResult({
        decision: "approved",
        comment: null,
        decidedAt: "2026-07-24T20:00:00.000Z",
      })
    ).toMatchObject({ success: true });
    expect(
      parseFlowcordiaApprovalResult({
        decision: "approved",
        comment: null,
        decidedAt: "2026-07-24T20:00:00.000Z",
        token: "secret",
      }).success
    ).toBe(false);
  });

  it("ships an approval template without browser callback identity", () => {
    const template = WORKFLOW_STUDIO_NODE_TEMPLATES.find((candidate) => candidate.id === "approval");
    expect(template).toMatchObject({ kind: "approval", operation: "approval.human" });
    expect(template?.defaultConfiguration).not.toHaveProperty("token");
    expect(template?.defaultConfiguration).not.toHaveProperty("callbackUrl");
  });
});
''',
)

replace(
    "packages/flowcordia-workflow/src/index.ts",
    'export * from "./catalog.js";\n',
    'export * from "./approval.js";\nexport * from "./catalog.js";\n',
)

replace(
    "packages/flowcordia-workflow/src/catalog.ts",
    '''  {
    id: "wait",
    defaultName: "Wait",''',
    '''  {
    id: "approval",
    defaultName: "Human approval",
    kind: "approval",
    operation: "approval.human",
    defaultConfiguration: {
      prompt: "Approve this workflow step?",
      instruction: "",
      timeoutSeconds: 86_400,
      requireComment: false,
    },
    inputs: ["input"],
    outputs: ["output"],
    defaultOutputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["decision", "comment", "decidedAt"],
      properties: {
        decision: { type: "string", enum: ["approved", "rejected"] },
        comment: { type: ["string", "null"] },
        decidedAt: { type: "string" },
      },
    },
  },
  {
    id: "wait",
    defaultName: "Wait",''',
)

replace(
    "packages/flowcordia-workflow/src/types.ts",
    '''    subflow: ["subflow.invoke"],
    condition: ["control.condition"],''',
    '''    subflow: ["subflow.invoke"],
    approval: ["approval.human"],
    condition: ["control.condition"],''',
)

replace(
    "packages/flowcordia-workflow/src/editor.ts",
    'import { validateFlowcordiaCredentialReferences } from "./credentials.js";\n',
    'import { parseFlowcordiaApprovalConfiguration } from "./approval.js";\nimport { validateFlowcordiaCredentialReferences } from "./credentials.js";\n',
)
replace(
    "packages/flowcordia-workflow/src/editor.ts",
    '''      } else if (node.operation === "data.map") {''',
    '''      } else if (node.operation === "approval.human") {
        const parsed = parseFlowcordiaApprovalConfiguration(command.configuration);
        if (!parsed.success) {
          return failure(
            "invalid_result",
            parsed.issues[0]?.message ?? "The approval configuration is invalid."
          );
        }
        node.configuration = parsed.configuration;
      } else if (node.operation === "data.map") {''',
)

replace(
    "packages/flowcordia-runtime/src/analyze.ts",
    '''  findInlineSecretPath,
  parseFlowcordiaHttpConfiguration,''',
    '''  findInlineSecretPath,
  parseFlowcordiaApprovalConfiguration,
  parseFlowcordiaHttpConfiguration,''',
)
replace(
    "packages/flowcordia-runtime/src/analyze.ts",
    '''  "subflow.invoke",
  "control.condition",''',
    '''  "subflow.invoke",
  "approval.human",
  "control.condition",''',
)
replace(
    "packages/flowcordia-runtime/src/analyze.ts",
    '''    case "control.wait":''',
    '''    case "approval.human": {
      const approvalConfiguration = parseFlowcordiaApprovalConfiguration(config);
      if (!approvalConfiguration.success) {
        return {
          code: "invalid_configuration",
          nodeId,
          message:
            approvalConfiguration.issues[0]?.message ?? "Approval configuration is invalid.",
        };
      }
      break;
    }
    case "control.wait":''',
)

replace(
    "packages/flowcordia-runtime/src/types.ts",
    '''  JsonObject,
  JsonValue,''',
    '''  FlowcordiaApprovalConfiguration,
  FlowcordiaApprovalResult,
  JsonObject,
  JsonValue,''',
)
replace(
    "packages/flowcordia-runtime/src/types.ts",
    '''  wait(input: { node: WorkflowNode; durationSeconds: number }): Promise<void>;
  subflow(input: {''',
    '''  wait(input: { node: WorkflowNode; durationSeconds: number }): Promise<void>;
  approval(input: {
    node: WorkflowNode;
    configuration: FlowcordiaApprovalConfiguration;
    value: JsonValue;
  }): Promise<FlowcordiaApprovalResult>;
  subflow(input: {''',
)
replace(
    "packages/flowcordia-runtime/src/types.ts",
    '''  subflowOutputs?: Readonly<Record<string, JsonValue | JsonValue[]>>;
}''',
    '''  subflowOutputs?: Readonly<Record<string, JsonValue | JsonValue[]>>;
  approvalDecision?: FlowcordiaApprovalResult;
}''',
)
replace(
    "packages/flowcordia-runtime/src/types.ts",
    '''  wait(durationSeconds: number): Promise<void>;
  authorizeHttp(url: URL): Promise<boolean> | boolean;''',
    '''  wait(durationSeconds: number): Promise<void>;
  approval?(input: {
    node: WorkflowNode;
    configuration: FlowcordiaApprovalConfiguration;
    value: JsonValue;
  }): Promise<FlowcordiaApprovalResult>;
  authorizeHttp(url: URL): Promise<boolean> | boolean;''',
)

replace(
    "packages/flowcordia-runtime/src/runtime.ts",
    '''  applyFlowcordiaMapping,
  createWorkflowFunctionPreviewValue,''',
    '''  applyFlowcordiaMapping,
  createWorkflowFunctionPreviewValue,
  parseFlowcordiaApprovalConfiguration,
  parseFlowcordiaApprovalResult,''',
)
replace(
    "packages/flowcordia-runtime/src/runtime.ts",
    '''    case "control.wait":
      await adapters.wait({ node, durationSeconds: Number(node.configuration.durationSeconds) });
      return value;''',
    '''    case "approval.human": {
      const parsed = parseFlowcordiaApprovalConfiguration(node.configuration);
      if (!parsed.success) {
        throw new Error(parsed.issues[0]?.message ?? "Approval configuration is invalid.");
      }
      const result = await adapters.approval({
        node,
        configuration: parsed.configuration,
        value,
      });
      const validated = parseFlowcordiaApprovalResult(result);
      if (!validated.success) throw new Error(validated.message);
      return validated.result;
    }
    case "control.wait":
      await adapters.wait({ node, durationSeconds: Number(node.configuration.durationSeconds) });
      return value;''',
)
replace(
    "packages/flowcordia-runtime/src/runtime.ts",
    '''      await recordTrace({ nodeId, operation: node.operation, status: "SUCCEEDED", output });''',
    '''      await recordTrace({
        nodeId,
        operation: node.operation,
        status: "SUCCEEDED",
        output,
        ...(node.operation === "approval.human" && adapters.mode === "preview"
          ? { message: "Human approval was simulated during structural preview." }
          : {}),
      });''',
)
replace(
    "packages/flowcordia-runtime/src/runtime.ts",
    '''    async wait() {
      // Preview proves the wait configuration without delaying the operator.
    },
    async subflow''',
    '''    async wait() {
      // Preview proves the wait configuration without delaying the operator.
    },
    async approval() {
      return (
        options.approvalDecision ?? {
          decision: "approved",
          comment: null,
          decidedAt: "1970-01-01T00:00:00.000Z",
        }
      );
    },
    async subflow''',
)
replace(
    "packages/flowcordia-runtime/src/runtime.ts",
    '''    async wait({ durationSeconds }) {
      await options.wait(durationSeconds);
    },''',
    '''    async wait({ durationSeconds }) {
      await options.wait(durationSeconds);
    },
    async approval(input) {
      if (!options.approval) {
        throw new Error("Human approval is unavailable in this runtime.");
      }
      return options.approval(input);
    },''',
)

replace(
    "packages/flowcordia-runtime/src/compiler.ts",
    '''  const hasSubflowNodes = workflow.nodes.some((node) => node.operation === "subflow.invoke");''',
    '''  const hasSubflowNodes = workflow.nodes.some((node) => node.operation === "subflow.invoke");
  const hasApprovalNodes = workflow.nodes.some((node) => node.operation === "approval.human");''',
)
replace(
    "packages/flowcordia-runtime/src/compiler.ts",
    '''  const runParameter = scheduleTrigger ? "payload" : "payload: JsonValue";
  const runtimePayload = scheduleTrigger
    ? [
        `    const flowcordiaPayload = JSON.parse(JSON.stringify(payload)) as JsonValue;`,''',
    '''  const runParameter = scheduleTrigger ? "payload, { ctx }" : "payload: JsonValue, { ctx }";
  const runtimePayload = scheduleTrigger
    ? [
        `    const adapters = createAdapters(ctx.run.id);`,
        `    const flowcordiaPayload = JSON.parse(JSON.stringify(payload)) as JsonValue;`,''',
)
replace(
    "packages/flowcordia-runtime/src/compiler.ts",
    '''    : [`    const result = await executeFlowcordiaWorkflow(workflow, payload, adapters, {`];''',
    '''    : [
        `    const adapters = createAdapters(ctx.run.id);`,
        `    const result = await executeFlowcordiaWorkflow(workflow, payload, adapters, {`,
      ];''',
)
replace(
    "packages/flowcordia-runtime/src/compiler.ts",
    '''    `const adapters = createTriggerRuntimeAdapters({`,''',
    '''    `const createAdapters = (flowcordiaRunId: string) => createTriggerRuntimeAdapters({`,''',
)
replace(
    "packages/flowcordia-runtime/src/compiler.ts",
    '''    ...(hasSubflowNodes
      ? [
          `  invokeSubflow: async ({ taskId, payloads }) => {`,''',
    '''    ...(hasApprovalNodes
      ? [
          `  approval: async ({ node, configuration }) => {`,
          `    const token = await wait.createToken({`,
          `      timeout: \`${"${configuration.timeoutSeconds}"}s\`,`,
          `      idempotencyKey: \`flowcordia-approval:${"${workflow.id}"}:${"${flowcordiaRunId}"}:${"${node.id}"}\`,`,
          `      idempotencyKeyTTL: \`${"${Math.min(configuration.timeoutSeconds + 86400, 2678400)}"}s\`,`,
          `      tags: ["flowcordia:approval"],`,
          `    });`,
          `    const timeoutAt = new Date(Date.now() + configuration.timeoutSeconds * 1000).toISOString();`,
          `    metadata.set("flowcordiaApproval", {`,
          `      schemaVersion: "0.1",`,
          `      state: "WAITING",`,
          `      waitpointId: token.id,`,
          `      workflowId: workflow.id,`,
          `      runId: flowcordiaRunId,`,
          `      nodeId: node.id,`,
          `      prompt: configuration.prompt,`,
          `      instruction: configuration.instruction,`,
          `      requireComment: configuration.requireComment,`,
          `      timeoutAt,`,
          `    });`,
          `    const completed = await wait.forToken<{ decision: "approved" | "rejected"; comment: string | null; decidedAt: string }>(token.id);`,
          `    if (!completed.ok) throw new Error("Human approval timed out before a decision was recorded.");`,
          `    metadata.set("flowcordiaApproval", {`,
          `      schemaVersion: "0.1",`,
          `      state: "DECIDED",`,
          `      waitpointId: token.id,`,
          `      workflowId: workflow.id,`,
          `      runId: flowcordiaRunId,`,
          `      nodeId: node.id,`,
          `      decision: completed.output.decision,`,
          `      decidedAt: completed.output.decidedAt,`,
          `    });`,
          `    return JSON.parse(JSON.stringify(completed.output)) as JsonValue;`,
          `  },`,
        ]
      : []),
    ...(hasSubflowNodes
      ? [
          `  invokeSubflow: async ({ taskId, payloads }) => {`,''',
)

write(
    "packages/flowcordia-runtime/test/approval-runtime.test.ts",
    '''import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import {
  compileWorkflowToTriggerTask,
  createPreviewRuntimeAdapters,
  createTriggerRuntimeAdapters,
  executeFlowcordiaWorkflow,
} from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "approval-workflow",
    name: "Approval workflow",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "approval",
        kind: "approval",
        operation: "approval.human",
        position: { x: 200, y: 0 },
        configuration: {
          prompt: "Approve this order?",
          instruction: "Check the amount.",
          timeoutSeconds: 3_600,
          requireComment: true,
        },
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 400, y: 0 },
        configuration: {},
      },
    ],
    edges: [
      { id: "trigger-approval", source: "trigger", target: "approval" },
      { id: "approval-output", source: "approval", target: "output" },
    ],
  };
}

describe("Flowcordia durable human approval runtime", () => {
  it("simulates one strict approval result without creating a live waitpoint", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { orderId: "order_1" },
      createPreviewRuntimeAdapters()
    );
    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      decision: "approved",
      comment: null,
      decidedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(result.traces[1]?.message).toContain("simulated");
  });

  it("returns the exact live decision through the runtime adapter", async () => {
    const adapters = createTriggerRuntimeAdapters({
      wait: async () => undefined,
      authorizeHttp: () => true,
      approval: async () => ({
        decision: "rejected",
        comment: "Amount is incorrect.",
        decidedAt: "2026-07-24T20:00:00.000Z",
      }),
    });
    const result = await executeFlowcordiaWorkflow(workflow(), {}, adapters);
    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({ decision: "rejected" });
  });

  it("fails closed on malformed live approval output", async () => {
    const adapters = createTriggerRuntimeAdapters({
      wait: async () => undefined,
      authorizeHttp: () => true,
      approval: async () => ({ decision: "approved" } as never),
    });
    const result = await executeFlowcordiaWorkflow(workflow(), {}, adapters);
    expect(result.success).toBe(false);
    expect(result.failedNodeId).toBe("approval");
  });

  it("generates an idempotent MANUAL waitpoint per exact run and node", () => {
    const result = compileWorkflowToTriggerTask(workflow());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artifact.source).toContain("wait.createToken");
    expect(result.artifact.source).toContain("wait.forToken");
    expect(result.artifact.source).toContain("ctx.run.id");
    expect(result.artifact.source).toContain("flowcordia-approval:${workflow.id}:${flowcordiaRunId}:${node.id}");
    expect(result.artifact.source).toContain('tags: ["flowcordia:approval"]');
    expect(result.artifact.source).toContain('metadata.set("flowcordiaApproval"');
    expect(result.artifact.source).not.toContain("publicAccessToken");
    expect(result.artifact.source).not.toContain("token.url");
  });
});
''',
)

replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''  FLOWCORDIA_HTTP_BODY_MODES,
  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,''',
    '''  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,
  FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH,
  FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS,
  FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS,
  FLOWCORDIA_HTTP_BODY_MODES,
  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,''',
)
replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''  parseFlowcordiaHttpConfiguration,
  parseFlowcordiaSubflowConfiguration,''',
    '''  parseFlowcordiaApprovalConfiguration,
  parseFlowcordiaHttpConfiguration,
  parseFlowcordiaSubflowConfiguration,''',
)
replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''  FLOWCORDIA_HTTP_BODY_MODES,
  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,''',
    '''  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,
  FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH,
  FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS,
  FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS,
  FLOWCORDIA_HTTP_BODY_MODES,
  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,''',
    count=1,
)
replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''  | { kind: "wait"; duration: string; unit: WorkflowStudioWaitUnit }
  | {''',
    '''  | { kind: "wait"; duration: string; unit: WorkflowStudioWaitUnit }
  | {
      kind: "approval";
      prompt: string;
      instruction: string;
      timeoutSeconds: string;
      requireComment: boolean;
    }
  | {''',
)
replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''    case "control.wait": {''',
    '''    case "approval.human": {
      const parsed = parseFlowcordiaApprovalConfiguration(configuration);
      if (!parsed.success) {
        return blocked(
          parsed.issues[0]?.message ??
            "The stored approval configuration is invalid and must be corrected in code."
        );
      }
      return {
        kind: "approval",
        prompt: parsed.configuration.prompt,
        instruction: parsed.configuration.instruction,
        timeoutSeconds: String(parsed.configuration.timeoutSeconds),
        requireComment: parsed.configuration.requireComment,
      };
    }
    case "control.wait": {''',
)
replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''    case "wait": {''',
    '''    case "approval": {
      const parsed = parseFlowcordiaApprovalConfiguration({
        prompt: draft.prompt,
        instruction: draft.instruction,
        timeoutSeconds: Number(draft.timeoutSeconds),
        requireComment: draft.requireComment,
      });
      return parsed.success
        ? { success: true, configuration: parsed.configuration }
        : {
            success: false,
            message: parsed.issues[0]?.message ?? "The approval configuration is invalid.",
          };
    }
    case "wait": {''',
)

replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioNodeConfigurationEditor.tsx",
    '''  FLOWCORDIA_CONDITION_OPERATORS,
  FLOWCORDIA_HTTP_BODY_MODES,''',
    '''  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,
  FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH,
  FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS,
  FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS,
  FLOWCORDIA_CONDITION_OPERATORS,
  FLOWCORDIA_HTTP_BODY_MODES,''',
)
replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioNodeConfigurationEditor.tsx",
    '''      {draft.kind === "subflow" && (''',
    '''      {draft.kind === "approval" && (
        <>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Approval prompt</span>
            <input
              className={inputClassName}
              value={draft.prompt}
              disabled={busy}
              maxLength={FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH}
              placeholder="Approve this workflow step?"
              onChange={(event) => update({ ...draft, prompt: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Reviewer instruction</span>
            <textarea
              className={inputClassName}
              value={draft.instruction}
              disabled={busy}
              rows={4}
              maxLength={FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH}
              placeholder="Explain what the reviewer should verify."
              onChange={(event) => update({ ...draft, instruction: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Timeout in seconds</span>
            <input
              className={inputClassName}
              value={draft.timeoutSeconds}
              disabled={busy}
              min={FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS}
              max={FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS}
              step={1}
              type="number"
              onChange={(event) => update({ ...draft, timeoutSeconds: event.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-xxs text-text-dimmed">
            <input
              checked={draft.requireComment}
              disabled={busy}
              type="checkbox"
              onChange={(event) => update({ ...draft, requireComment: event.target.checked })}
            />
            Require a reviewer comment
          </label>
          <div className="rounded border border-blue-500/20 bg-blue-500/5 px-2.5 py-2 text-xxs leading-4 text-blue-200">
            Live runs pause durably in the environment approval inbox. Structural preview simulates an
            approved result without creating a waitpoint.
          </div>
        </>
      )}

      {draft.kind === "subflow" && (''',
)

replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/presentation.ts",
    '''  "subflow.invoke": ["workflowId", "mode", "itemsPath", "maxItems"],
  "control.condition":''',
    '''  "subflow.invoke": ["workflowId", "mode", "itemsPath", "maxItems"],
  "approval.human": ["prompt", "instruction", "timeoutSeconds", "requireComment"],
  "control.condition":''',
)

write(
    "apps/webapp/test/flowcordia/workflowStudioApprovalConfiguration.test.ts",
    '''import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
} from "../../app/features/flowcordia/workflows/studio/node-configuration";

describe("Flowcordia Studio approval configuration", () => {
  it("round-trips the bounded visual approval form", () => {
    const draft = createWorkflowStudioNodeConfigurationDraft("approval.human", {
      prompt: "Approve the refund?",
      instruction: "Verify the amount.",
      timeoutSeconds: 3_600,
      requireComment: true,
    });
    expect(draft).toMatchObject({ kind: "approval", timeoutSeconds: "3600" });
    expect(buildWorkflowStudioNodeConfiguration(draft)).toEqual({
      success: true,
      configuration: {
        prompt: "Approve the refund?",
        instruction: "Verify the amount.",
        timeoutSeconds: 3_600,
        requireComment: true,
      },
    });
  });

  it("blocks unknown repository-owned approval fields instead of dropping them", () => {
    expect(
      createWorkflowStudioNodeConfigurationDraft("approval.human", {
        prompt: "Approve?",
        instruction: "",
        timeoutSeconds: 3_600,
        requireComment: false,
        quorum: 2,
      })
    ).toMatchObject({ kind: "blocked" });
  });
});
''',
)
