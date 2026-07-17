from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content)


def replace(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new))


# Strict repository fixture contract.
replace(
    "packages/flowcordia-workflow/src/functions.ts",
    'import { validateWorkflowFunctionSchema } from "./function-schema.js";\nimport type { JsonObject } from "./types.js";',
    'import {\n  formatWorkflowFunctionValuePath,\n  validateWorkflowFunctionSchema,\n  validateWorkflowFunctionValue,\n} from "./function-schema.js";\nimport { findInlineSecretPath } from "./security.js";\nimport type { JsonObject, JsonValue } from "./types.js";',
)
replace(
    "packages/flowcordia-workflow/src/functions.ts",
    '  "outputSchema",\n]);\nconst CODE_REFERENCE_KEYS = new Set(["path", "exportName"]);',
    '  "outputSchema",\n  "fixtures",\n]);\nconst CODE_REFERENCE_KEYS = new Set(["path", "exportName"]);\nconst FIXTURE_KEYS = new Set(["id", "name", "description", "input", "mockOutput"]);',
)
replace(
    "packages/flowcordia-workflow/src/functions.ts",
    'export interface WorkflowFunctionDefinition {\n  id: string;',
    'export interface WorkflowFunctionFixture {\n  id: string;\n  name: string;\n  description?: string;\n  input: JsonObject;\n  mockOutput: JsonObject;\n}\n\nexport interface WorkflowFunctionDefinition {\n  id: string;',
)
replace(
    "packages/flowcordia-workflow/src/functions.ts",
    '  inputSchema: JsonObject;\n  outputSchema: JsonObject;\n}',
    '  inputSchema: JsonObject;\n  outputSchema: JsonObject;\n  fixtures?: WorkflowFunctionFixture[];\n}',
)
fixture_validation = r'''
function validateFixtureValue(
  value: unknown,
  schema: unknown,
  path: ReadonlyArray<string | number>,
  label: "input" | "mockOutput",
  issues: WorkflowFunctionCatalogIssue[],
  functionId?: string
) {
  if (!isRecord(value)) {
    issue(
      issues,
      {
        code: value === undefined ? "required" : "invalid_type",
        message: `Fixture ${label} must be a JSON object.`,
        path,
      },
      functionId
    );
    return;
  }
  validateJsonValue(value, path, issues, functionId);
  const secretPath = findInlineSecretPath(value as JsonValue);
  if (secretPath) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: `Fixture ${label} cannot contain inline secrets or credential-like values.`,
        path: [...path, ...secretPath],
      },
      functionId
    );
  }
  if (
    !isRecord(schema) ||
    validateWorkflowFunctionSchema(schema, { requireObjectRoot: true }).length > 0
  ) {
    return;
  }
  for (const valueIssue of validateWorkflowFunctionValue(
    schema as JsonObject,
    value as JsonValue
  )) {
    issue(
      issues,
      {
        code: valueIssue.code === "invalid_type" ? "invalid_type" : "invalid_value",
        message: `Fixture ${label} failed the function contract at ${formatWorkflowFunctionValuePath(valueIssue.path)}: ${valueIssue.message}`,
        path: [...path, ...valueIssue.path],
      },
      functionId
    );
  }
}

function validateFixtures(
  value: unknown,
  inputSchema: unknown,
  outputSchema: unknown,
  path: ReadonlyArray<string | number>,
  issues: WorkflowFunctionCatalogIssue[],
  functionId?: string
) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issue(
      issues,
      { code: "invalid_type", message: "Function fixtures must be an array.", path },
      functionId
    );
    return;
  }
  if (value.length > 50) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: "A function cannot define more than 50 fixtures.",
        path,
      },
      functionId
    );
  }
  const seen = new Set<string>();
  value.forEach((candidate, index) => {
    const fixturePath = [...path, index];
    if (!isRecord(candidate)) {
      issue(
        issues,
        { code: "invalid_type", message: "Fixture must be an object.", path: fixturePath },
        functionId
      );
      return;
    }
    unknownProperties(candidate, FIXTURE_KEYS, fixturePath, issues, functionId);
    const fixtureId = stringField(
      candidate,
      "id",
      fixturePath,
      issues,
      { required: true, maxLength: 128, pattern: FUNCTION_ID_PATTERN },
      functionId
    );
    stringField(candidate, "name", fixturePath, issues, { required: true, maxLength: 160 }, functionId);
    stringField(candidate, "description", fixturePath, issues, { maxLength: 2_000 }, functionId);
    validateFixtureValue(
      candidate.input,
      inputSchema,
      [...fixturePath, "input"],
      "input",
      issues,
      functionId
    );
    validateFixtureValue(
      candidate.mockOutput,
      outputSchema,
      [...fixturePath, "mockOutput"],
      "mockOutput",
      issues,
      functionId
    );
    if (fixtureId && seen.has(fixtureId)) {
      issue(
        issues,
        {
          code: "duplicate_id",
          message: `Duplicate fixture ID "${fixtureId}".`,
          path: [...fixturePath, "id"],
        },
        functionId
      );
    }
    if (fixtureId) seen.add(fixtureId);
  });
}

'''
replace(
    "packages/flowcordia-workflow/src/functions.ts",
    "function validateFunction(\n",
    fixture_validation + "function validateFunction(\n",
)
replace(
    "packages/flowcordia-workflow/src/functions.ts",
    '  validateSchema(value.inputSchema, [...path, "inputSchema"], issues, functionId);\n  validateSchema(value.outputSchema, [...path, "outputSchema"], issues, functionId);\n  return id;',
    '  validateSchema(value.inputSchema, [...path, "inputSchema"], issues, functionId);\n  validateSchema(value.outputSchema, [...path, "outputSchema"], issues, functionId);\n  validateFixtures(\n    value.fixtures,\n    value.inputSchema,\n    value.outputSchema,\n    [...path, "fixtures"],\n    issues,\n    functionId\n  );\n  return id;',
)

# Published JSON Schema and example.
schema_path = ROOT / "packages/flowcordia-workflow/schema/functions-0.1.json"
schema = json.loads(schema_path.read_text())
schema["$defs"]["fixture"] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["id", "name", "input", "mockOutput"],
    "properties": {
        "id": {"type": "string", "pattern": "^[a-z][a-z0-9_-]{1,127}$"},
        "name": {"type": "string", "minLength": 1, "maxLength": 160},
        "description": {"type": "string", "minLength": 1, "maxLength": 2000},
        "input": {"type": "object"},
        "mockOutput": {"type": "object"},
    },
}
schema["$defs"]["function"]["properties"]["fixtures"] = {
    "type": "array",
    "maxItems": 50,
    "items": {"$ref": "#/$defs/fixture"},
}
schema_path.write_text(json.dumps(schema, indent=2) + "\n")

example_path = ROOT / "packages/flowcordia-workflow/catalog-examples/functions.json"
example = json.loads(example_path.read_text())
example["functions"][0]["fixtures"] = [
    {
        "id": "qualified_lead",
        "name": "Qualified lead",
        "description": "A deterministic structural-preview case maintained with the function.",
        "input": {"leadId": "lead_123"},
        "mockOutput": {"qualified": True},
    }
]
example_path.write_text(json.dumps(example, indent=2) + "\n")

# Preview runtime accepts server-owned, node-scoped mocks only.
replace(
    "packages/flowcordia-runtime/src/types.ts",
    'export interface FlowcordiaTriggerRuntimeOptions {',
    'export interface FlowcordiaPreviewRuntimeOptions {\n  codeMocks?: Readonly<Record<string, JsonValue>>;\n}\n\nexport interface FlowcordiaTriggerRuntimeOptions {',
)
replace(
    "packages/flowcordia-runtime/src/runtime.ts",
    '  FlowcordiaRuntimeAdapters,\n  FlowcordiaTriggerRuntimeOptions,',
    '  FlowcordiaPreviewRuntimeOptions,\n  FlowcordiaRuntimeAdapters,\n  FlowcordiaTriggerRuntimeOptions,',
)
replace(
    "packages/flowcordia-runtime/src/runtime.ts",
    'export function createPreviewRuntimeAdapters(): FlowcordiaRuntimeAdapters {',
    'export function createPreviewRuntimeAdapters(\n  options: FlowcordiaPreviewRuntimeOptions = {}\n): FlowcordiaRuntimeAdapters {',
)
replace(
    "packages/flowcordia-runtime/src/runtime.ts",
    '    async code({ node, reference, value }) {\n      if (node.outputSchema) return createWorkflowFunctionPreviewValue(node.outputSchema);',
    '    async code({ node, reference, value }) {\n      const mocked = options.codeMocks?.[node.id];\n      if (mocked !== undefined) return jsonValue(mocked);\n      if (node.outputSchema) return createWorkflowFunctionPreviewValue(node.outputSchema);',
)

# Browser-safe projection exposes fixture inputs but never mock outputs.
write(
    "apps/webapp/app/features/flowcordia/workflows/functions/presentation.ts",
    '''import type {
  GitHubFunctionCatalogReadValue,
  GitHubWorkflowStoreError,
} from "@flowcordia/github-workflows";
import type { JsonObject } from "@flowcordia/workflow";

export interface WorkflowFunctionFixtureItem {
  id: string;
  name: string;
  description: string | null;
  input: JsonObject;
}

export interface WorkflowFunctionCatalogItem {
  id: string;
  name: string;
  description: string | null;
  codePath: string;
  exportName: string;
  inputFields: string[];
  outputFields: string[];
  fixtures: WorkflowFunctionFixtureItem[];
}

export interface WorkflowFunctionCatalogProjection {
  state: "READY" | "NOT_CONFIGURED" | "INVALID" | "UNAVAILABLE";
  functions: WorkflowFunctionCatalogItem[];
  source: { path: string; commitSha: string; blobSha: string } | null;
  message: string | null;
  retryable: boolean;
}

function schemaFields(schema: JsonObject): string[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.keys(properties).sort().slice(0, 100);
}

export function presentWorkflowFunctionCatalog(
  value: GitHubFunctionCatalogReadValue
): WorkflowFunctionCatalogProjection {
  return {
    state: "READY",
    functions: value.catalog.functions.map((definition) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description ?? null,
      codePath: definition.codeReference.path,
      exportName: definition.codeReference.exportName,
      inputFields: schemaFields(definition.inputSchema),
      outputFields: schemaFields(definition.outputSchema),
      fixtures: (definition.fixtures ?? []).map((fixture) => ({
        id: fixture.id,
        name: fixture.name,
        description: fixture.description ?? null,
        input: JSON.parse(JSON.stringify(fixture.input)) as JsonObject,
      })),
    })),
    source: {
      path: value.source.path,
      commitSha: value.source.commitSha,
      blobSha: value.source.blobSha,
    },
    message: null,
    retryable: false,
  };
}

export function presentWorkflowFunctionCatalogError(
  error: GitHubWorkflowStoreError
): WorkflowFunctionCatalogProjection {
  if (error.code === "not_found") {
    return {
      state: "NOT_CONFIGURED",
      functions: [],
      source: null,
      message: "Add .flowcordia/functions.json to publish repository-owned functions in Studio.",
      retryable: false,
    };
  }
  const invalid = error.code === "invalid_document" || error.code === "invalid_input";
  return {
    state: invalid ? "INVALID" : "UNAVAILABLE",
    functions: [],
    source: null,
    message: error.catalogIssues?.[0]?.message ?? error.message,
    retryable: error.retryable,
  };
}

export function unavailableWorkflowFunctionCatalog(): WorkflowFunctionCatalogProjection {
  return {
    state: "UNAVAILABLE",
    functions: [],
    source: null,
    message: "The repository function catalog could not be loaded safely.",
    retryable: true,
  };
}
''',
)

# Studio selects exact repository fixtures; custom edits clear fixture identity.
panel = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowFunctionTestPanel.tsx"
replace(
    panel,
    'import type { FlowcordiaPreviewProjection } from "../preview/presentation";',
    'import type { WorkflowFunctionCatalogProjection } from "../functions/presentation";\nimport type { FlowcordiaPreviewProjection } from "../preview/presentation";',
)
replace(panel, '  preview,\n  repositoryKey,', '  preview,\n  functionCatalog,\n  repositoryKey,')
replace(
    panel,
    '  preview: FlowcordiaPreviewProjection;\n  repositoryKey: string;',
    '  preview: FlowcordiaPreviewProjection;\n  functionCatalog: WorkflowFunctionCatalogProjection;\n  repositoryKey: string;',
)
replace(
    panel,
    '  onRunStructural: (payload: JsonValue) => void;',
    '  onRunStructural: (\n    payload: JsonValue,\n    fixture: { nodeId: string; fixtureId: string } | null\n  ) => void;',
)
replace(
    panel,
    '  const schema = selectedFunction?.inputSchema ?? null;\n  const [payload, setPayload] = useState<JsonValue>(() =>',
    '  const schema = selectedFunction?.inputSchema ?? null;\n  const selectedCatalogFunction = selectedFunction?.codeReference\n    ? functionCatalog.functions.find(\n        (definition) =>\n          definition.codePath === selectedFunction.codeReference?.path &&\n          definition.exportName === selectedFunction.codeReference?.exportName\n      ) ?? null\n    : null;\n  const fixtures = selectedCatalogFunction?.fixtures ?? [];\n  const [fixtureId, setFixtureId] = useState("");\n  const [payload, setPayload] = useState<JsonValue>(() =>',
)
replace(
    panel,
    '  useEffect(() => {\n    if (!selectedFunction?.inputSchema) {',
    '  useEffect(() => {\n    setFixtureId("");\n  }, [selectedFunction?.id]);\n\n  useEffect(() => {\n    if (!selectedFunction?.inputSchema) {',
)
replace(
    panel,
    '  const updatePayload = (next: JsonValue) => {\n    setPayload(next);',
    '  const updatePayload = (next: JsonValue) => {\n    setFixtureId("");\n    setPayload(next);',
)
replace(
    panel,
    '  const resolvedPayload = (): JsonValue | null => {',
    '  const applyFixture = (nextFixtureId: string) => {\n    setFixtureId(nextFixtureId);\n    const fixture = fixtures.find((candidate) => candidate.id === nextFixtureId);\n    if (!fixture) return;\n    const next = JSON.parse(JSON.stringify(fixture.input)) as JsonValue;\n    setPayload(next);\n    setRawPayload(outputText(next));\n    setRawError(null);\n    setInputMode("form");\n  };\n\n  const resolvedPayload = (): JsonValue | null => {',
)
replace(
    panel,
    '    if (mode === "structural") onRunStructural(next);\n    else onRunLive(next);',
    '    if (mode === "structural") {\n      onRunStructural(\n        next,\n        fixtureId && selectedFunction ? { nodeId: selectedFunction.id, fixtureId } : null\n      );\n    } else {\n      onRunLive(next);\n    }',
)
replace(
    panel,
    '<div className={cn("grid gap-3", functions.length > 0 && "sm:grid-cols-2")}>',
    '<div className={cn("grid gap-3", functions.length > 0 && "lg:grid-cols-3")}>',
)
fixture_selector = '''            {fixtures.length > 0 && (
              <label>
                <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                  Repository fixture
                </span>
                <select
                  className={inputClassName}
                  value={fixtureId}
                  disabled={busy}
                  onChange={(event) => applyFixture(event.target.value)}
                >
                  <option value="">Custom input</option>
                  {fixtures.map((fixture) => (
                    <option key={fixture.id} value={fixture.id}>
                      {fixture.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
'''
replace(
    panel,
    '            <div>\n              <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">\n                Input editor',
    fixture_selector + '            <div>\n              <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">\n                Input editor',
)
replace(
    panel,
    '                onChange={(event) => {\n                  setRawPayload(event.target.value);',
    '                onChange={(event) => {\n                  setFixtureId("");\n                  setRawPayload(event.target.value);',
)
replace(
    panel,
    '          {mode === "live" && !liveReady && (',
    '          {fixtureId && mode === "structural" && (\n            <div className="rounded border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xxs leading-4 text-indigo-200">\n              Structural Preview will use the repository-owned mock output for this exact fixture.\n              Live Preview always executes the exact deployed proposal instead.\n            </div>\n          )}\n\n          {mode === "live" && !liveReady && (',
)

# Shell carries fixture identity, not mock output.
shell = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioTestingShell.tsx"
replace(
    shell,
    'import type { FlowcordiaPreviewProjection } from "../preview/presentation";',
    'import type { WorkflowFunctionCatalogProjection } from "../functions/presentation";\nimport type { FlowcordiaPreviewProjection } from "../preview/presentation";',
)
replace(shell, '  preview,\n  repositoryKey,', '  preview,\n  functionCatalog,\n  repositoryKey,')
replace(
    shell,
    '  preview: FlowcordiaPreviewProjection;\n  repositoryKey: string;',
    '  preview: FlowcordiaPreviewProjection;\n  functionCatalog: WorkflowFunctionCatalogProjection;\n  repositoryKey: string;',
)
replace(
    shell,
    '  const runStructural = (payload: JsonValue) => {',
    '  const runStructural = (\n    payload: JsonValue,\n    fixture: { nodeId: string; fixtureId: string } | null\n  ) => {',
)
replace(
    shell,
    '      payload,\n    };',
    '      payload,\n      ...(fixture ? { fixture } : {}),\n    };',
)
replace(
    shell,
    '          preview={preview}\n          repositoryKey={repositoryKey}',
    '          preview={preview}\n          functionCatalog={functionCatalog}\n          repositoryKey={repositoryKey}',
)

route = "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
replace(
    route,
    '            preview={data.preview}\n            repositoryKey=',
    '            preview={data.preview}\n            functionCatalog={data.functionCatalog}\n            repositoryKey=',
)

# Server command and exact-commit fixture authority.
commands = "apps/webapp/app/features/flowcordia/workflows/drafts/commands.server.ts"
replace(
    commands,
    '      payload: z.unknown(),\n    })',
    '      payload: z.unknown(),\n      fixture: z\n        .object({ nodeId: EntityId, fixtureId: EntityId })\n        .strict()\n        .optional(),\n    })',
)
replace(
    commands,
    '        payload: parsed.data.payload as import("@flowcordia/workflow").JsonValue,\n      });',
    '        payload: parsed.data.payload as import("@flowcordia/workflow").JsonValue,\n        fixture: parsed.data.fixture,\n      });',
)

service = "apps/webapp/app/features/flowcordia/workflows/drafts/service.server.ts"
fixture_resolver = r'''
async function resolveWorkflowFixtureMock(input: {
  scope: WorkflowDraftScope;
  draft: WorkflowDraftRecord;
  payload: JsonValue;
  nodeId: string;
  fixtureId: string;
}): Promise<JsonValue> {
  const node = input.draft.document.nodes.find((candidate) => candidate.id === input.nodeId);
  const functionId = node?.configuration.functionId;
  if (!node || node.operation !== "code.task" || typeof functionId !== "string") {
    throw new WorkflowDraftError(
      "invalid_input",
      "The selected fixture target is not a repository function node."
    );
  }
  const { functionCatalog } = await createWorkflowIndexGitHubGateway(input.scope);
  const catalog = await functionCatalog.read({
    scope: input.scope,
    revision: input.draft.baseCommitSha,
  });
  if (!catalog.success) {
    throw new WorkflowDraftError(
      catalog.error.retryable ? "draft_unavailable" : "invalid_input",
      catalog.error.catalogIssues?.[0]?.message ?? catalog.error.message,
      catalog.error.retryable
    );
  }
  if (
    catalog.value.source.requestedRevision !== input.draft.baseCommitSha ||
    catalog.value.source.commitSha !== input.draft.baseCommitSha
  ) {
    throw new WorkflowDraftError(
      "stale_source",
      "The fixture catalog could not be proven against this draft's exact repository revision."
    );
  }
  const definition = catalog.value.catalog.functions.find((candidate) => candidate.id === functionId);
  const fixture = definition?.fixtures?.find((candidate) => candidate.id === input.fixtureId);
  if (!fixture) {
    throw new WorkflowDraftError(
      "invalid_input",
      `Fixture "${input.fixtureId}" is not available for this function at the draft revision.`
    );
  }
  if (JSON.stringify(fixture.input) !== JSON.stringify(input.payload)) {
    throw new WorkflowDraftError(
      "invalid_input",
      "Repository fixture input changed in the browser. Select the fixture again before testing."
    );
  }
  return fixture.mockOutput;
}

'''
replace(service, 'export async function previewWorkflowDraft(input: {', fixture_resolver + 'export async function previewWorkflowDraft(input: {')
replace(
    service,
    '  payload: JsonValue;\n}): Promise<FlowcordiaExecutionResult> {',
    '  payload: JsonValue;\n  fixture?: { nodeId: string; fixtureId: string };\n}): Promise<FlowcordiaExecutionResult> {',
)
replace(
    service,
    '  const result = await executeFlowcordiaWorkflow(\n    draft.document,\n    input.payload,\n    createPreviewRuntimeAdapters(),',
    '  const fixtureMock = input.fixture\n    ? await resolveWorkflowFixtureMock({\n        scope: input.scope,\n        draft,\n        payload: input.payload,\n        nodeId: input.fixture.nodeId,\n        fixtureId: input.fixture.fixtureId,\n      })\n    : undefined;\n  const result = await executeFlowcordiaWorkflow(\n    draft.document,\n    input.payload,\n    createPreviewRuntimeAdapters({\n      ...(input.fixture && fixtureMock !== undefined\n        ? { codeMocks: { [input.fixture.nodeId]: fixtureMock } }\n        : {}),\n    }),',
)

# Contract, runtime, and safe-projection tests.
functions_test = "packages/flowcordia-workflow/test/functions.test.ts"
replace(
    functions_test,
    '        outputSchema: {\n          type: "object",\n          required: ["qualified"],\n          properties: { qualified: { type: "boolean" } },\n        },',
    '        outputSchema: {\n          type: "object",\n          required: ["qualified"],\n          properties: { qualified: { type: "boolean" } },\n        },\n        fixtures: [\n          {\n            id: "qualified_lead",\n            name: "Qualified lead",\n            input: { leadId: "lead_123" },\n            mockOutput: { qualified: true },\n          },\n        ],',
)
replace(
    functions_test,
    '  it("rejects generated-directory and unsupported source references", () => {',
    '''  it("rejects fixture contract drift, duplicate IDs, and inline secrets", () => {
    const source = catalog();
    source.functions[0]!.fixtures!.push({
      ...source.functions[0]!.fixtures![0]!,
      input: { leadId: 42 },
      mockOutput: { qualified: "yes" },
    } as never);
    source.functions[0]!.fixtures![0]!.input = {
      leadId: "lead_123",
      apiKey: "must-not-enter-a-fixture",
    } as never;

    expect(parseWorkflowFunctionCatalog(source)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_id", path: ["functions", 0, "fixtures", 1, "id"] }),
        expect.objectContaining({ code: "invalid_type", path: ["functions", 0, "fixtures", 1, "input", "leadId"] }),
        expect.objectContaining({ code: "invalid_type", path: ["functions", 0, "fixtures", 1, "mockOutput", "qualified"] }),
        expect.objectContaining({ code: "invalid_value", path: ["functions", 0, "fixtures", 0, "input", "apiKey"] }),
      ]),
    });
  });

  it("rejects generated-directory and unsupported source references", () => {''',
)

runtime_test = "packages/flowcordia-runtime/test/function-contract.test.ts"
replace(
    runtime_test,
    '  it("uses a schema-shaped structural preview without executing repository code", async () => {',
    '''  it("uses an exact node-scoped repository fixture mock during structural preview", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { leadId: "lead_123" },
      createPreviewRuntimeAdapters({
        codeMocks: { function_qualify: { qualified: true } },
      })
    );

    expect(result).toMatchObject({
      success: true,
      output: { qualified: true },
      traces: expect.arrayContaining([
        expect.objectContaining({
          nodeId: "function_qualify",
          status: "SUCCEEDED",
          output: { qualified: true },
        }),
      ]),
    });
  });

  it("uses a schema-shaped structural preview without executing repository code", async () => {''',
)

presentation_test = "apps/webapp/test/flowcordia/workflowStudioPresentation.test.ts"
replace(
    presentation_test,
    '            outputSchema: {\n              type: "object",\n              properties: { qualified: { type: "boolean" } },\n            },',
    '            outputSchema: {\n              type: "object",\n              properties: { qualified: { type: "boolean" } },\n            },\n            fixtures: [\n              {\n                id: "qualified_lead",\n                name: "Qualified lead",\n                input: { leadId: "lead_123" },\n                mockOutput: { qualified: true },\n              },\n            ],',
)
replace(
    presentation_test,
    '          exportName: "qualifyLead",\n        },',
    '          exportName: "qualifyLead",\n          fixtures: [\n            {\n              id: "qualified_lead",\n              name: "Qualified lead",\n              input: { leadId: "lead_123" },\n            },\n          ],\n        },',
)
replace(
    presentation_test,
    '    expect(JSON.stringify(result)).not.toContain("properties");',
    '    expect(JSON.stringify(result)).not.toContain("properties");\n    expect(JSON.stringify(result)).not.toContain("mockOutput");\n    expect(JSON.stringify(result)).not.toContain("qualified\\\":true");',
)

# Reference repository publishes one reviewed fixture.
reference_catalog = ROOT / "packages/flowcordia-runtime/test/fixtures/reference-repository/.flowcordia/functions.json"
reference = json.loads(reference_catalog.read_text())
reference["functions"][0]["fixtures"] = [
    {
        "id": "qualified_lead",
        "name": "Qualified lead",
        "input": {"leadId": "lead_123"},
        "mockOutput": {"qualified": True},
    }
]
reference_catalog.write_text(json.dumps(reference, indent=2) + "\n")

# Product record.
replace(
    "flowcordia/product/roadmap.md",
    '- Add repository code editing, developer-provided tests, fixtures, and mocks.',
    '- Add repository-owned structural fixtures and deterministic mocks. — delivered through the exact-commit function catalog with server-owned mock resolution\n- Add repository code editing and executable developer-provided tests.',
)
replace(
    "flowcordia/architecture/custom-typed-functions.md",
    'This slice discovers, adds, removes, compiles, enforces, and schema-tests typed repository functions. Repository code editing, developer-provided fixtures and mocks, catalog reconciliation after developer changes, and richer secret-aware fixture management remain later focused Phase 2 slices.',
    'This slice discovers, adds, removes, compiles, enforces, and schema-tests typed repository functions. Repository-owned structural fixtures and deterministic mocks are resolved at the draft\'s exact commit and never accepted from the browser. Repository code editing, executable developer tests, catalog reconciliation after developer changes, and richer credential-backed fixture management remain later focused Phase 2 slices.',
)
replace(
    "flowcordia/testing/schema-driven-function-testing.md",
    '| fallback | advanced JSON remains usable for whole-workflow testing and schema checked when a direct function contract exists |',
    '| repository fixtures | fixture input is browser-visible only after secret screening; mock output remains server-only, is reread at the exact draft commit, and is applied only to the selected function node |\n| fallback | advanced JSON remains usable for whole-workflow testing and schema checked when a direct function contract exists |',
)
replace(
    "flowcordia/testing/schema-driven-function-testing.md",
    '12. Inspect the proposal and workflow JSON and confirm no test payload was committed.',
    '12. Select a repository fixture and confirm Structural Preview uses its reviewed mock output while Live Preview still executes the exact deployment.\n13. Modify the fixture input and confirm the fixture identity is cleared and the server rejects mismatched fixture input.\n14. Inspect the proposal and workflow JSON and confirm no test payload or mock output was committed.',
)

print("Applied repository-owned function fixture slice.")
