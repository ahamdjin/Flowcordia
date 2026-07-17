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
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:160]!r}")
    write(path, content.replace(old, new))


functions = "packages/flowcordia-workflow/src/functions.ts"
replace(
    functions,
    'import type { JsonObject, JsonValue } from "./types.js";',
    'import type { JsonObject, JsonValue, WorkflowNode } from "./types.js";',
)

resolver = r'''
export type WorkflowFunctionFixtureResolution =
  | { success: true; mockOutput: JsonObject }
  | {
      success: false;
      code: "invalid_target" | "function_mismatch" | "fixture_not_found" | "input_mismatch";
      message: string;
    };

function fixtureJsonSignature(value: JsonValue): string {
  const normalize = (candidate: JsonValue): JsonValue => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)])
      ) as JsonObject;
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
}

function fixtureResolutionFailure(
  code: Exclude<WorkflowFunctionFixtureResolution, { success: true }>["code"],
  message: string
): WorkflowFunctionFixtureResolution {
  return { success: false, code, message };
}

export function resolveWorkflowFunctionFixture(input: {
  catalog: WorkflowFunctionCatalog;
  node: WorkflowNode;
  fixtureId: string;
  payload: JsonValue;
}): WorkflowFunctionFixtureResolution {
  const functionId = input.node.configuration.functionId;
  if (
    input.node.operation !== "code.task" ||
    typeof functionId !== "string" ||
    !input.node.codeReference ||
    input.node.codeReference.repository !== undefined ||
    input.node.codeReference.commit !== undefined
  ) {
    return fixtureResolutionFailure(
      "invalid_target",
      "The selected fixture target is not an exact repository function node."
    );
  }

  const definition = input.catalog.functions.find((candidate) => candidate.id === functionId);
  if (!definition) {
    return fixtureResolutionFailure(
      "function_mismatch",
      `Function "${functionId}" is not present in the exact repository catalog.`
    );
  }

  const identityMatches =
    input.node.codeReference.path === definition.codeReference.path &&
    input.node.codeReference.exportName === definition.codeReference.exportName &&
    input.node.inputSchema !== undefined &&
    input.node.outputSchema !== undefined &&
    fixtureJsonSignature(input.node.inputSchema) === fixtureJsonSignature(definition.inputSchema) &&
    fixtureJsonSignature(input.node.outputSchema) === fixtureJsonSignature(definition.outputSchema);
  if (!identityMatches) {
    return fixtureResolutionFailure(
      "function_mismatch",
      "The workflow node does not match the repository function identity and schemas at this revision."
    );
  }

  const fixture = definition.fixtures?.find((candidate) => candidate.id === input.fixtureId);
  if (!fixture) {
    return fixtureResolutionFailure(
      "fixture_not_found",
      `Fixture "${input.fixtureId}" is not available for this exact repository function.`
    );
  }

  if (fixtureJsonSignature(fixture.input) !== fixtureJsonSignature(input.payload)) {
    return fixtureResolutionFailure(
      "input_mismatch",
      "Repository fixture input changed in the browser. Select the fixture again before testing."
    );
  }

  return {
    success: true,
    mockOutput: JSON.parse(JSON.stringify(fixture.mockOutput)) as JsonObject,
  };
}

'''
replace(functions, "function validateFunction(\n", resolver + "function validateFunction(\n")

service = "apps/webapp/app/features/flowcordia/workflows/drafts/service.server.ts"
replace(
    service,
    'import type { JsonValue } from "@flowcordia/workflow";\nimport { addWorkflowFunctionNode, applyWorkflowEdit } from "@flowcordia/workflow";',
    'import {\n  addWorkflowFunctionNode,\n  applyWorkflowEdit,\n  resolveWorkflowFunctionFixture,\n  type JsonValue,\n} from "@flowcordia/workflow";',
)
replace(
    service,
    '''  const node = input.draft.document.nodes.find((candidate) => candidate.id === input.nodeId);
  const functionId = node?.configuration.functionId;
  if (!node || node.operation !== "code.task" || typeof functionId !== "string") {
    throw new WorkflowDraftError(
      "invalid_input",
      "The selected fixture target is not a repository function node."
    );
  }
''',
    '''  const node = input.draft.document.nodes.find((candidate) => candidate.id === input.nodeId);
  if (!node) {
    throw new WorkflowDraftError(
      "invalid_input",
      "The selected fixture target is not a repository function node."
    );
  }
''',
)
replace(
    service,
    '''  const definition = catalog.value.catalog.functions.find(
    (candidate) => candidate.id === functionId
  );
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
''',
    '''  const resolution = resolveWorkflowFunctionFixture({
    catalog: catalog.value.catalog,
    node,
    fixtureId: input.fixtureId,
    payload: input.payload,
  });
  if (!resolution.success) {
    throw new WorkflowDraftError("invalid_input", resolution.message);
  }
  return resolution.mockOutput;
''',
)

presentation = "apps/webapp/app/features/flowcordia/workflows/studio/presentation.ts"
replace(
    presentation,
    '  editableConfiguration: JsonObject | null;\n  inputSchema: JsonObject | null;',
    '  editableConfiguration: JsonObject | null;\n  functionId: string | null;\n  inputSchema: JsonObject | null;',
)
replace(
    presentation,
    '''      editableConfiguration:
        workflowNodeOwnership(node) === "visual"
          ? editableConfiguration(node.operation, node.configuration)
          : null,
      inputSchema: cloneSchema(node.inputSchema),
''',
    '''      editableConfiguration:
        workflowNodeOwnership(node) === "visual"
          ? editableConfiguration(node.operation, node.configuration)
          : null,
      functionId:
        node.operation === "code.task" && typeof node.configuration.functionId === "string"
          ? node.configuration.functionId
          : null,
      inputSchema: cloneSchema(node.inputSchema),
''',
)

panel = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowFunctionTestPanel.tsx"
replace(
    panel,
    '''        (definition) =>
          definition.codePath === selectedFunction.codeReference?.path &&
          definition.exportName === selectedFunction.codeReference?.exportName
''',
    '''        (definition) =>
          definition.id === selectedFunction.functionId &&
          definition.codePath === selectedFunction.codeReference?.path &&
          definition.exportName === selectedFunction.codeReference?.exportName
''',
)

functions_test = "packages/flowcordia-workflow/test/functions.test.ts"
replace(
    functions_test,
    'import { parseWorkflowFunctionCatalog, type WorkflowFunctionCatalog } from "../src/index.js";',
    'import {\n  parseWorkflowFunctionCatalog,\n  resolveWorkflowFunctionFixture,\n  type WorkflowFunctionCatalog,\n  type WorkflowNode,\n} from "../src/index.js";',
)
node_fixture = r'''
function functionNode(source: WorkflowFunctionCatalog = catalog()): WorkflowNode {
  const definition = source.functions[0]!;
  return {
    id: "function_qualify_lead",
    name: definition.name,
    kind: "code",
    operation: "code.task",
    position: { x: 100, y: 100 },
    configuration: { functionId: definition.id },
    inputSchema: JSON.parse(JSON.stringify(definition.inputSchema)),
    outputSchema: JSON.parse(JSON.stringify(definition.outputSchema)),
    codeReference: {
      path: definition.codeReference.path,
      exportName: definition.codeReference.exportName,
    },
  };
}

'''
replace(functions_test, 'describe("workflow function catalog", () => {', node_fixture + 'describe("workflow function catalog", () => {')
resolution_tests = r'''
  it("resolves only exact repository function fixtures and returns a defensive mock copy", () => {
    const source = catalog();
    source.functions[0]!.inputSchema = {
      type: "object",
      required: ["leadId", "source"],
      properties: {
        leadId: { type: "string" },
        source: { type: "string" },
      },
    };
    source.functions[0]!.fixtures![0]!.input = { leadId: "lead_123", source: "web" };
    const node = functionNode(source);

    const resolved = resolveWorkflowFunctionFixture({
      catalog: source,
      node,
      fixtureId: "qualified_lead",
      payload: { source: "web", leadId: "lead_123" },
    });

    expect(resolved).toEqual({ success: true, mockOutput: { qualified: true } });
    if (resolved.success) resolved.mockOutput.qualified = false;
    expect(source.functions[0]!.fixtures![0]!.mockOutput).toEqual({ qualified: true });
  });

  it("fails closed for function identity, schema, fixture, and payload tampering", () => {
    const source = catalog();
    const codeMismatch = functionNode(source);
    codeMismatch.codeReference!.path = "src/flowcordia/other.ts";
    const schemaMismatch = functionNode(source);
    schemaMismatch.outputSchema = { type: "object", properties: { score: { type: "number" } } };

    expect(
      resolveWorkflowFunctionFixture({
        catalog: source,
        node: codeMismatch,
        fixtureId: "qualified_lead",
        payload: { leadId: "lead_123" },
      })
    ).toMatchObject({ success: false, code: "function_mismatch" });
    expect(
      resolveWorkflowFunctionFixture({
        catalog: source,
        node: schemaMismatch,
        fixtureId: "qualified_lead",
        payload: { leadId: "lead_123" },
      })
    ).toMatchObject({ success: false, code: "function_mismatch" });
    expect(
      resolveWorkflowFunctionFixture({
        catalog: source,
        node: functionNode(source),
        fixtureId: "missing_fixture",
        payload: { leadId: "lead_123" },
      })
    ).toMatchObject({ success: false, code: "fixture_not_found" });
    expect(
      resolveWorkflowFunctionFixture({
        catalog: source,
        node: functionNode(source),
        fixtureId: "qualified_lead",
        payload: { leadId: "tampered" },
      })
    ).toMatchObject({ success: false, code: "input_mismatch" });
  });

'''
replace(
    functions_test,
    '  it("rejects generated-directory and unsupported source references", () => {',
    resolution_tests + '  it("rejects generated-directory and unsupported source references", () => {',
)

draft_presentation_test = "apps/webapp/test/flowcordia/workflowDraftPresentation.test.ts"
replace(
    draft_presentation_test,
    '''    expect(node).toMatchObject({
      ownership: "developer",
      editableConfiguration: null,
''',
    '''    expect(node).toMatchObject({
      ownership: "developer",
      editableConfiguration: null,
      functionId: "qualify_lead",
''',
)

matrix = "flowcordia/testing/schema-driven-function-testing.md"
replace(
    matrix,
    '| fixture failure | missing, stale, mismatched, secret-bearing, or schema-invalid fixtures fail closed before any downstream structural execution |',
    '| fixture identity | the server proves function ID, repository path, export name, input schema, and output schema against the exact-commit catalog before resolving a mock |\n| fixture failure | missing, stale, mismatched, secret-bearing, or schema-invalid fixtures fail closed before any downstream structural execution |',
)

print("Applied exact repository fixture identity hardening.")
