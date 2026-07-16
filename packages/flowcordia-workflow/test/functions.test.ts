import { describe, expect, it } from "vitest";
import { parseWorkflowFunctionCatalog, type WorkflowFunctionCatalog } from "../src/index.js";

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
      },
    ],
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
