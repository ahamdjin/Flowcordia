import { describe, expect, it } from "vitest";
import {
  parseWorkflowFunctionCatalog,
  resolveWorkflowFunctionFixture,
  type WorkflowFunctionCatalog,
  type WorkflowNode,
} from "../src/index.js";

function catalog(): WorkflowFunctionCatalog {
  return {
    schemaVersion: "0.1",
    functions: [
      {
        id: "qualify_lead",
        name: "Qualify lead",
        description: "Applies the repository-owned lead scoring policy.",
        codeReference: {
          path: "src/flowcordia/qualify-lead.ts",
          exportName: "qualifyLead",
        },
        inputSchema: {
          type: "object",
          required: ["leadId"],
          properties: { leadId: { type: "string" } },
        },
        outputSchema: {
          type: "object",
          required: ["qualified"],
          properties: { qualified: { type: "boolean" } },
        },
        fixtures: [
          {
            id: "qualified_lead",
            name: "Qualified lead",
            input: { leadId: "lead_123" },
            mockOutput: { qualified: true },
          },
        ],
      },
    ],
  };
}

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

describe("workflow function catalog", () => {
  it("parses a strict typed repository function manifest", () => {
    const result = parseWorkflowFunctionCatalog(JSON.stringify(catalog()));

    expect(result).toEqual({ success: true, catalog: catalog(), issues: [] });
  });

  it("rejects duplicate IDs and unknown properties", () => {
    const source = catalog() as WorkflowFunctionCatalog & { browserCode?: string };
    source.browserCode = "not allowed";
    source.functions.push({ ...source.functions[0]! });

    const result = parseWorkflowFunctionCatalog(source);

    expect(result).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "unknown_property", path: ["browserCode"] }),
        expect.objectContaining({ code: "duplicate_id", functionId: "qualify_lead" }),
      ]),
    });
  });

  it("rejects traversal, export injection, and untyped schemas", () => {
    const source = catalog();
    source.functions[0]!.codeReference.path = "../secrets.ts";
    source.functions[0]!.codeReference.exportName = "qualifyLead as injected";
    source.functions[0]!.inputSchema = { type: "string" };

    const result = parseWorkflowFunctionCatalog(source);

    expect(result).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: ["functions", 0, "codeReference", "path"],
        }),
        expect.objectContaining({
          code: "invalid_value",
          path: ["functions", 0, "codeReference", "exportName"],
        }),
        expect.objectContaining({
          code: "invalid_value",
          path: ["functions", 0, "inputSchema", "type"],
        }),
      ]),
    });
  });

  it("rejects non-JSON schema values before browser projection", () => {
    const source = catalog() as unknown as Record<string, unknown>;
    const functions = source.functions as Array<Record<string, unknown>>;
    functions[0]!.outputSchema = { type: "object", transform: () => true };

    expect(parseWorkflowFunctionCatalog(source)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_type",
          path: ["functions", 0, "outputSchema", "transform"],
        }),
      ]),
    });
  });

  it("rejects schemas outside the executable contract subset", () => {
    const source = catalog();
    source.functions[0]!.inputSchema = {
      type: "object",
      properties: "not-an-object",
    };

    expect(parseWorkflowFunctionCatalog(source)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_type",
          path: ["functions", 0, "inputSchema", "properties"],
        }),
      ]),
    });
  });

  it("rejects fixture contract drift, duplicate IDs, and inline secrets", () => {
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
        expect.objectContaining({
          code: "duplicate_id",
          path: ["functions", 0, "fixtures", 1, "id"],
        }),
        expect.objectContaining({
          code: "invalid_type",
          path: ["functions", 0, "fixtures", 1, "input", "leadId"],
        }),
        expect.objectContaining({
          code: "invalid_type",
          path: ["functions", 0, "fixtures", 1, "mockOutput", "qualified"],
        }),
        expect.objectContaining({
          code: "invalid_value",
          path: ["functions", 0, "fixtures", 0, "input", "apiKey"],
        }),
      ]),
    });
  });

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

  it("rejects generated-directory and unsupported source references", () => {
    const generated = catalog();
    generated.functions[0]!.codeReference.path = "trigger/flowcordia/lead_intake.ts";
    const unsupported = catalog();
    unsupported.functions[0]!.codeReference.path = "src/functions/qualifyLead.txt";

    expect(parseWorkflowFunctionCatalog(generated)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: ["functions", 0, "codeReference", "path"],
        }),
      ]),
    });
    expect(parseWorkflowFunctionCatalog(unsupported)).toMatchObject({ success: false });
  });
});
