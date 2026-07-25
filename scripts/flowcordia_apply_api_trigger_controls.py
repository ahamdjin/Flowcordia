from pathlib import Path

def replace_one(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new))

Path("packages/flowcordia-workflow/src/api-trigger.ts").write_text('''import type { JsonObject, JsonValue } from "./types.js";

export const FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS = 60;
export const FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS = 30 * 24 * 60 * 60;
export const FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS = 60;
export const FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS = 14 * 24 * 60 * 60;
export const FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_KEY_LENGTH = 256;

export const FLOWCORDIA_API_TRIGGER_DEFAULT_CONFIGURATION = {
  requireIdempotencyKey: true,
  idempotencyKeyTTLSeconds: 24 * 60 * 60,
  queueTTLSeconds: 60 * 60,
} as const;

export interface FlowcordiaApiTriggerConfiguration extends JsonObject {
  requireIdempotencyKey: boolean;
  idempotencyKeyTTLSeconds: number;
  queueTTLSeconds: number;
}

export type FlowcordiaApiTriggerConfigurationResult =
  | { success: true; configuration: FlowcordiaApiTriggerConfiguration }
  | { success: false; issues: Array<{ path: string; message: string }> };

export interface FlowcordiaApiTriggerRequest extends JsonObject {
  payload: JsonValue;
  options: JsonObject;
}

export type FlowcordiaApiTriggerRequestResult =
  | {
      success: true;
      configuration: FlowcordiaApiTriggerConfiguration;
      request: FlowcordiaApiTriggerRequest;
    }
  | { success: false; issues: Array<{ path: string; message: string }> };

function boundedInteger(input: {
  value: unknown;
  fallback: number;
  min: number;
  max: number;
  path: string;
  label: string;
  issues: Array<{ path: string; message: string }>;
}): number {
  const value = input.value === undefined ? input.fallback : input.value;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < input.min ||
    value > input.max
  ) {
    input.issues.push({
      path: input.path,
      message: `${input.label} must be an integer between ${input.min} and ${input.max} seconds.`,
    });
    return input.fallback;
  }
  return value;
}

export function parseFlowcordiaApiTriggerConfiguration(
  value: JsonObject
): FlowcordiaApiTriggerConfigurationResult {
  const issues: Array<{ path: string; message: string }> = [];
  const allowed = new Set([
    "requireIdempotencyKey",
    "idempotencyKeyTTLSeconds",
    "queueTTLSeconds",
  ]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    issues.push({
      path: unknown,
      message: "API trigger configuration contains an unsupported field.",
    });
  }

  const requireIdempotencyKey =
    value.requireIdempotencyKey === undefined
      ? FLOWCORDIA_API_TRIGGER_DEFAULT_CONFIGURATION.requireIdempotencyKey
      : value.requireIdempotencyKey;
  if (typeof requireIdempotencyKey !== "boolean") {
    issues.push({
      path: "requireIdempotencyKey",
      message: "API trigger requireIdempotencyKey must be a boolean.",
    });
  }

  const idempotencyKeyTTLSeconds = boundedInteger({
    value: value.idempotencyKeyTTLSeconds,
    fallback: FLOWCORDIA_API_TRIGGER_DEFAULT_CONFIGURATION.idempotencyKeyTTLSeconds,
    min: FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS,
    max: FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS,
    path: "idempotencyKeyTTLSeconds",
    label: "API trigger idempotency-key TTL",
    issues,
  });
  const queueTTLSeconds = boundedInteger({
    value: value.queueTTLSeconds,
    fallback: FLOWCORDIA_API_TRIGGER_DEFAULT_CONFIGURATION.queueTTLSeconds,
    min: FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS,
    max: FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS,
    path: "queueTTLSeconds",
    label: "API trigger queue TTL",
    issues,
  });

  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    configuration: {
      requireIdempotencyKey: requireIdempotencyKey as boolean,
      idempotencyKeyTTLSeconds,
      queueTTLSeconds,
    },
  };
}

export function buildFlowcordiaApiTriggerRequest(input: {
  configuration: JsonObject;
  payload: JsonValue;
  idempotencyKey?: string;
}): FlowcordiaApiTriggerRequestResult {
  const parsed = parseFlowcordiaApiTriggerConfiguration(input.configuration);
  if (!parsed.success) return parsed;

  const idempotencyKey = input.idempotencyKey?.trim() ?? "";
  if (
    idempotencyKey.length > FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_KEY_LENGTH ||
    (parsed.configuration.requireIdempotencyKey && idempotencyKey.length === 0)
  ) {
    return {
      success: false,
      issues: [
        {
          path: "idempotencyKey",
          message: parsed.configuration.requireIdempotencyKey
            ? `API trigger requests require an idempotency key with 1-${FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_KEY_LENGTH} characters.`
            : `API trigger idempotency keys must stay under ${FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
        },
      ],
    };
  }

  const options: JsonObject = {
    ttl: `${parsed.configuration.queueTTLSeconds}s`,
  };
  if (idempotencyKey) {
    options.idempotencyKey = idempotencyKey;
    options.idempotencyKeyTTL = `${parsed.configuration.idempotencyKeyTTLSeconds}s`;
  }

  return {
    success: true,
    configuration: parsed.configuration,
    request: { payload: input.payload, options },
  };
}
''')

Path("packages/flowcordia-workflow/test/api-trigger.test.ts").write_text('''import { describe, expect, it } from "vitest";
import {
  applyWorkflowEdit,
  buildFlowcordiaApiTriggerRequest,
  parseFlowcordiaApiTriggerConfiguration,
  type WorkflowDefinition,
} from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "api_orders",
    name: "API orders",
    nodes: [
      {
        id: "api",
        kind: "trigger",
        operation: "trigger.api",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 280, y: 0 },
        configuration: {},
      },
    ],
    edges: [{ id: "api_to_output", source: "api", target: "output" }],
  };
}

describe("Flowcordia API trigger controls", () => {
  it("normalizes legacy empty configuration to safe defaults", () => {
    expect(parseFlowcordiaApiTriggerConfiguration({})).toEqual({
      success: true,
      configuration: {
        requireIdempotencyKey: true,
        idempotencyKeyTTLSeconds: 86_400,
        queueTTLSeconds: 3_600,
      },
    });
  });

  it("builds exact native task request options", () => {
    expect(
      buildFlowcordiaApiTriggerRequest({
        configuration: {
          requireIdempotencyKey: true,
          idempotencyKeyTTLSeconds: 7_200,
          queueTTLSeconds: 900,
        },
        payload: { orderId: "ord_123" },
        idempotencyKey: "order-ord_123",
      })
    ).toEqual({
      success: true,
      configuration: {
        requireIdempotencyKey: true,
        idempotencyKeyTTLSeconds: 7_200,
        queueTTLSeconds: 900,
      },
      request: {
        payload: { orderId: "ord_123" },
        options: {
          idempotencyKey: "order-ord_123",
          idempotencyKeyTTL: "7200s",
          ttl: "900s",
        },
      },
    });
  });

  it("fails closed for missing keys, unsafe TTLs, and unknown fields", () => {
    expect(
      buildFlowcordiaApiTriggerRequest({
        configuration: {},
        payload: {},
      })
    ).toMatchObject({ success: false, issues: [{ path: "idempotencyKey" }] });
    expect(
      parseFlowcordiaApiTriggerConfiguration({
        requireIdempotencyKey: true,
        idempotencyKeyTTLSeconds: 59,
        queueTTLSeconds: 1_209_601,
      })
    ).toMatchObject({ success: false });
    expect(parseFlowcordiaApiTriggerConfiguration({ mode: "payload-hash" })).toMatchObject({
      success: false,
      issues: [{ path: "mode" }],
    });
  });

  it("persists only normalized API trigger configuration through the portable editor", () => {
    expect(
      applyWorkflowEdit(workflow(), {
        type: "set_node_configuration",
        nodeId: "api",
        configuration: {
          requireIdempotencyKey: false,
          idempotencyKeyTTLSeconds: 600,
          queueTTLSeconds: 300,
        },
      })
    ).toMatchObject({
      success: true,
      workflow: {
        nodes: [
          expect.objectContaining({
            id: "api",
            configuration: {
              requireIdempotencyKey: false,
              idempotencyKeyTTLSeconds: 600,
              queueTTLSeconds: 300,
            },
          }),
          expect.anything(),
        ],
      },
    });
  });
});
''')

Path("apps/webapp/test/flowcordia/workflowStudioApiTriggerConfiguration.test.ts").write_text('''import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
} from "../../app/features/flowcordia/workflows/studio/node-configuration";

describe("Flowcordia Studio API trigger configuration", () => {
  it("round-trips idempotency and queue TTL controls", () => {
    const draft = createWorkflowStudioNodeConfigurationDraft("trigger.api", {
      requireIdempotencyKey: true,
      idempotencyKeyTTLSeconds: 7_200,
      queueTTLSeconds: 900,
    });
    expect(draft).toEqual({
      kind: "api_trigger",
      requireIdempotencyKey: true,
      idempotencyKeyTTLSeconds: "7200",
      queueTTLSeconds: "900",
    });
    expect(buildWorkflowStudioNodeConfiguration(draft)).toEqual({
      success: true,
      configuration: {
        requireIdempotencyKey: true,
        idempotencyKeyTTLSeconds: 7_200,
        queueTTLSeconds: 900,
      },
    });
  });

  it("defaults legacy API triggers and blocks unknown repository-owned fields", () => {
    expect(createWorkflowStudioNodeConfigurationDraft("trigger.api", {})).toEqual({
      kind: "api_trigger",
      requireIdempotencyKey: true,
      idempotencyKeyTTLSeconds: "86400",
      queueTTLSeconds: "3600",
    });
    expect(
      createWorkflowStudioNodeConfigurationDraft("trigger.api", {
        mode: "payload-hash",
      })
    ).toMatchObject({ kind: "blocked" });
  });
});
''')

Path("flowcordia/testing/api-trigger-idempotency.md").write_text('''# API trigger idempotency and TTL acceptance

## Goal

Prove that Flowcordia projects bounded request controls into the inherited authenticated task endpoint instead of creating a parallel ingress or queue.

## Repository contracts

The focused gate proves:

- legacy empty API-trigger configuration receives safe defaults;
- unknown configuration fails closed;
- idempotency-key TTL is limited to 60 seconds through 30 days;
- queue-expiration TTL is limited to 60 seconds through 14 days;
- required idempotency keys are 1-256 characters;
- optional idempotency omits both key and key TTL when no key is supplied;
- generated compiler metadata identifies the exact native request fields and bounded duration strings;
- Studio round-trips only the three documented fields;
- the portable editor persists only normalized configuration;
- existing manual, schedule, and webhook bindings remain unchanged.

## Connected acceptance still required

A protected environment run must invoke one exact deployed API workflow through the project-access-token endpoint and preserve payload-free evidence for:

1. the first idempotent request;
2. a duplicate request inside the configured key TTL returning the original run;
3. a request after the key TTL creating a new run;
4. a queued run exceeding its configured queue TTL becoming expired before execution;
5. a failed run clearing its idempotency key according to the inherited runtime behavior.

Repository tests prove the request and compilation contract. They do not claim a configured production endpoint has executed these cases.
''')

replace_one(
    "packages/flowcordia-workflow/src/index.ts",
    'export * from "./approval.js";\n',
    'export * from "./api-trigger.js";\nexport * from "./approval.js";\n',
)
replace_one(
    "packages/flowcordia-workflow/src/catalog.ts",
    '''    operation: "trigger.api",
    defaultName: "API trigger",
    defaultConfiguration: {},
    defaultOutputSchema: { type: "object" },''',
    '''    operation: "trigger.api",
    defaultName: "API trigger",
    defaultConfiguration: {
      requireIdempotencyKey: true,
      idempotencyKeyTTLSeconds: 86_400,
      queueTTLSeconds: 3_600,
    },
    defaultOutputSchema: { type: "object" },''',
)
replace_one(
    "packages/flowcordia-workflow/src/editor.ts",
    'import { parseFlowcordiaApprovalConfiguration } from "./approval.js";\n',
    'import { parseFlowcordiaApiTriggerConfiguration } from "./api-trigger.js";\nimport { parseFlowcordiaApprovalConfiguration } from "./approval.js";\n',
)
replace_one(
    "packages/flowcordia-workflow/src/editor.ts",
    '''      if (node.operation === "action.http") {
        const parsed = parseFlowcordiaHttpConfiguration(command.configuration);''',
    '''      if (node.operation === "trigger.api") {
        const parsed = parseFlowcordiaApiTriggerConfiguration(command.configuration);
        if (!parsed.success) {
          return failure(
            "invalid_result",
            parsed.issues[0]?.message ?? "The API trigger configuration is invalid."
          );
        }
        node.configuration = parsed.configuration;
      } else if (node.operation === "action.http") {
        const parsed = parseFlowcordiaHttpConfiguration(command.configuration);''',
)
replace_one(
    "packages/flowcordia-runtime/src/analyze.ts",
    '  findInlineSecretPath,\n',
    '  findInlineSecretPath,\n  parseFlowcordiaApiTriggerConfiguration,\n',
)
replace_one(
    "packages/flowcordia-runtime/src/analyze.ts",
    '''  switch (node.operation) {
    case "trigger.schedule":''',
    '''  switch (node.operation) {
    case "trigger.api": {
      const apiTriggerConfiguration = parseFlowcordiaApiTriggerConfiguration(config);
      if (!apiTriggerConfiguration.success) {
        return {
          code: "invalid_configuration",
          nodeId,
          message:
            apiTriggerConfiguration.issues[0]?.message ??
            "API trigger configuration is invalid.",
        };
      }
      break;
    }
    case "trigger.schedule":''',
)
replace_one(
    "packages/flowcordia-runtime/src/types.ts",
    '''    authentication: "project_access_token";
  } | null;''',
    '''    authentication: "project_access_token";
    request: {
      payloadField: "payload";
      optionsField: "options";
      idempotency: {
        keyPath: "options.idempotencyKey";
        required: boolean;
        ttlPath: "options.idempotencyKeyTTL";
        ttl: string;
        scope: "task_environment";
      };
      queueTTL: {
        path: "options.ttl";
        value: string;
        semantics: "expire_before_start";
      };
    };
  } | null;''',
)
replace_one(
    "packages/flowcordia-runtime/src/compiler.ts",
    '  parseFlowcordiaHttpConfiguration,\n',
    '  parseFlowcordiaApiTriggerConfiguration,\n  parseFlowcordiaHttpConfiguration,\n',
)
replace_one(
    "packages/flowcordia-runtime/src/compiler.ts",
    '''  const triggerOperations = workflow.nodes
    .filter((node) => node.kind === "trigger")
    .map((node) => node.operation);
  const triggerBinding = triggerOperations.includes("trigger.api")
    ? {
        kind: "authenticated_api" as const,
        method: "POST" as const,
        path: `/api/v1/tasks/${encodeURIComponent(taskId)}/trigger`,
        authentication: "project_access_token" as const,
      }
    : null;''',
    '''  const triggerOperations = workflow.nodes
    .filter((node) => node.kind === "trigger")
    .map((node) => node.operation);
  const apiTriggerNode = workflow.nodes.find((node) => node.operation === "trigger.api");
  const parsedApiTrigger = apiTriggerNode
    ? parseFlowcordiaApiTriggerConfiguration(apiTriggerNode.configuration)
    : null;
  const apiTriggerConfiguration =
    parsedApiTrigger?.success === true ? parsedApiTrigger.configuration : null;
  const triggerBinding = apiTriggerConfiguration
    ? {
        kind: "authenticated_api" as const,
        method: "POST" as const,
        path: `/api/v1/tasks/${encodeURIComponent(taskId)}/trigger`,
        authentication: "project_access_token" as const,
        request: {
          payloadField: "payload" as const,
          optionsField: "options" as const,
          idempotency: {
            keyPath: "options.idempotencyKey" as const,
            required: apiTriggerConfiguration.requireIdempotencyKey,
            ttlPath: "options.idempotencyKeyTTL" as const,
            ttl: `${apiTriggerConfiguration.idempotencyKeyTTLSeconds}s`,
            scope: "task_environment" as const,
          },
          queueTTL: {
            path: "options.ttl" as const,
            value: `${apiTriggerConfiguration.queueTTLSeconds}s`,
            semantics: "expire_before_start" as const,
          },
        },
      }
    : null;''',
)
replace_one(
    "packages/flowcordia-runtime/test/runtime.test.ts",
    '''    source.nodes[0]!.operation = "trigger.api";
    source.nodes[0]!.configuration = {};''',
    '''    source.nodes[0]!.operation = "trigger.api";
    source.nodes[0]!.configuration = {
      requireIdempotencyKey: true,
      idempotencyKeyTTLSeconds: 7_200,
      queueTTLSeconds: 900,
    };''',
)
replace_one(
    "packages/flowcordia-runtime/test/runtime.test.ts",
    '''      authentication: "project_access_token",
    });
    expect(result.artifact.warnings).toEqual([]);''',
    '''      authentication: "project_access_token",
      request: {
        payloadField: "payload",
        optionsField: "options",
        idempotency: {
          keyPath: "options.idempotencyKey",
          required: true,
          ttlPath: "options.idempotencyKeyTTL",
          ttl: "7200s",
          scope: "task_environment",
        },
        queueTTL: {
          path: "options.ttl",
          value: "900s",
          semantics: "expire_before_start",
        },
      },
    });
    expect(result.artifact.warnings).toEqual([]);''',
)

replace_one(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''import {
  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,''',
    '''import {
  FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS,
  FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS,
  FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS,
  FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS,
  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,''',
)
replace_one(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''  parseFlowcordiaApprovalConfiguration,
''',
    '''  parseFlowcordiaApiTriggerConfiguration,
  parseFlowcordiaApprovalConfiguration,
''',
)
replace_one(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''export {
  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,''',
    '''export {
  FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS,
  FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS,
  FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS,
  FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS,
  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,''',
)
replace_one(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''  | {
      kind: "empty";
      operation: "trigger.manual" | "trigger.api" | "output.return";
    }
  | { kind: "schedule"; cron: string; timezone: string }''',
    '''  | {
      kind: "empty";
      operation: "trigger.manual" | "output.return";
    }
  | {
      kind: "api_trigger";
      requireIdempotencyKey: boolean;
      idempotencyKeyTTLSeconds: string;
      queueTTLSeconds: string;
    }
  | { kind: "schedule"; cron: string; timezone: string }''',
)
replace_one(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''    case "trigger.manual":
    case "trigger.api":
    case "output.return": {
      const unsupported = requiresKnownKeys(configuration, []);
      return unsupported ?? { kind: "empty", operation };
    }
    case "trigger.schedule": {''',
    '''    case "trigger.manual":
    case "output.return": {
      const unsupported = requiresKnownKeys(configuration, []);
      return unsupported ?? { kind: "empty", operation };
    }
    case "trigger.api": {
      const parsed = parseFlowcordiaApiTriggerConfiguration(configuration);
      if (!parsed.success) {
        return blocked(
          parsed.issues[0]?.message ??
            "The stored API trigger configuration is invalid and must be corrected in code."
        );
      }
      return {
        kind: "api_trigger",
        requireIdempotencyKey: parsed.configuration.requireIdempotencyKey,
        idempotencyKeyTTLSeconds: String(parsed.configuration.idempotencyKeyTTLSeconds),
        queueTTLSeconds: String(parsed.configuration.queueTTLSeconds),
      };
    }
    case "trigger.schedule": {''',
)
replace_one(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    '''    case "empty":
      return { success: true, configuration: {} };
    case "schedule": {''',
    '''    case "empty":
      return { success: true, configuration: {} };
    case "api_trigger": {
      const parsed = parseFlowcordiaApiTriggerConfiguration({
        requireIdempotencyKey: draft.requireIdempotencyKey,
        idempotencyKeyTTLSeconds: Number(draft.idempotencyKeyTTLSeconds),
        queueTTLSeconds: Number(draft.queueTTLSeconds),
      });
      return parsed.success
        ? { success: true, configuration: parsed.configuration }
        : {
            success: false,
            message: parsed.issues[0]?.message ?? "The API trigger configuration is invalid.",
          };
    }
    case "schedule": {''',
)

replace_one(
    "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioNodeConfigurationEditor.tsx",
    '''  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,''',
    '''  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
  FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS,
  FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS,
  FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS,
  FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS,
  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,''',
)
replace_one(
    "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioNodeConfigurationEditor.tsx",
    '''      {draft.kind === "schedule" && (
''',
    '''      {draft.kind === "api_trigger" && (
        <>
          <label className="flex items-center gap-2 text-xxs text-text-dimmed">
            <input
              checked={draft.requireIdempotencyKey}
              disabled={busy}
              type="checkbox"
              onChange={(event) =>
                update({ ...draft, requireIdempotencyKey: event.target.checked })
              }
            />
            Require an idempotency key on generated requests
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xxs text-text-dimmed">
                Idempotency-key TTL in seconds
              </span>
              <input
                className={inputClassName}
                value={draft.idempotencyKeyTTLSeconds}
                disabled={busy}
                min={FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS}
                max={FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS}
                step={1}
                type="number"
                onChange={(event) =>
                  update({ ...draft, idempotencyKeyTTLSeconds: event.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xxs text-text-dimmed">
                Queue TTL in seconds
              </span>
              <input
                className={inputClassName}
                value={draft.queueTTLSeconds}
                disabled={busy}
                min={FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS}
                max={FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS}
                step={1}
                type="number"
                onChange={(event) => update({ ...draft, queueTTLSeconds: event.target.value })}
              />
            </label>
          </div>
          <div className="rounded border border-blue-500/20 bg-blue-500/5 px-2.5 py-2 text-xxs leading-4 text-blue-200">
            Flowcordia projects these values into the native task request contract. Queue TTL expires
            a run only if it has not started; idempotency-key TTL controls the duplicate-request
            window for the same task and environment.
          </div>
        </>
      )}

      {draft.kind === "schedule" && (
''',
)

replace_one(
    "apps/webapp/app/features/flowcordia/workflows/studio/presentation.ts",
    '''  "trigger.api": [],
''',
    '''  "trigger.api": [
    "requireIdempotencyKey",
    "idempotencyKeyTTLSeconds",
    "queueTTLSeconds",
  ],
''',
)
replace_one(
    "flowcordia/product/capability-matrix.md",
    "| Idempotency and TTL | Advanced trigger settings | Planned |",
    "| Idempotency and TTL | API trigger request policy | Backward-compatible strict configuration, Studio controls, portable request builder, exact native option paths, bounded idempotency-key TTL, bounded queue-expiration TTL, compiler projection, and round-trip tests delivered; protected duplicate/expiry acceptance remains mandatory |",
)
