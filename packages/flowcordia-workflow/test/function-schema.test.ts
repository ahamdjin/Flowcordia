import { describe, expect, it } from "vitest";

import {
  createWorkflowFunctionPreviewValue,
  validateWorkflowFunctionSchema,
  validateWorkflowFunctionValue,
  type JsonObject,
} from "../src/index.js";

describe("Ajv-backed function contracts", () => {
  it("combines JSON Schema structure with Flowcordia subset policy", () => {
    const issues = validateWorkflowFunctionSchema(
      {
        type: "array",
        properties: {},
        minItems: 2,
        maxItems: 1,
      },
      { requireObjectRoot: true }
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown_property", path: ["properties"] }),
        expect.objectContaining({ code: "required", path: ["items"] }),
        expect.objectContaining({ code: "invalid_value", path: ["maxItems"] }),
        expect.objectContaining({ code: "invalid_value", path: ["type"] }),
      ])
    );
  });

  it("rejects minimum requirements larger than deterministic previews can satisfy", () => {
    expect(
      validateWorkflowFunctionSchema({
        type: "array",
        minItems: 11,
        items: { type: "string" },
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_value", path: ["minItems"] }),
      ])
    );
    expect(validateWorkflowFunctionSchema({ type: "string", minLength: 101 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_value", path: ["minLength"] }),
      ])
    );
  });

  it("keeps accepted preview bounds valid against their own contract", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["items", "name"],
      properties: {
        items: { type: "array", minItems: 10, items: { type: "integer" } },
        name: { type: "string", minLength: 100 },
      },
    } as JsonObject;

    expect(validateWorkflowFunctionSchema(schema, { requireObjectRoot: true })).toEqual([]);
    expect(
      validateWorkflowFunctionValue(schema, createWorkflowFunctionPreviewValue(schema))
    ).toEqual([]);
  });

  it("validates values with Ajv and preserves issue identities", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["name", "scores"],
      properties: {
        name: { type: "string", minLength: 3 },
        scores: {
          type: "array",
          minItems: 2,
          items: { type: "integer", minimum: 1 },
        },
      },
    } as JsonObject;

    expect(
      validateWorkflowFunctionValue(schema, {
        name: "x",
        scores: [0],
        extra: true,
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "additional_property", path: ["extra"] }),
        expect.objectContaining({ code: "constraint", path: ["name"] }),
        expect.objectContaining({ code: "constraint", path: ["scores"] }),
        expect.objectContaining({ code: "constraint", path: ["scores", 0] }),
      ])
    );
  });

  it("keeps deterministic preview generation", () => {
    expect(
      createWorkflowFunctionPreviewValue({
        type: "object",
        required: ["enabled", "items"],
        properties: {
          enabled: { type: "boolean" },
          items: { type: "array", minItems: 2, items: { type: "integer", minimum: 4 } },
        },
      })
    ).toEqual({ enabled: false, items: [4, 4] });
  });

  it("keeps maximum-only negative numeric previews valid", () => {
    for (const schema of [
      { type: "number", maximum: -1 },
      { type: "integer", maximum: -1.5 },
    ] as JsonObject[]) {
      expect(validateWorkflowFunctionSchema(schema)).toEqual([]);
      expect(
        validateWorkflowFunctionValue(schema, createWorkflowFunctionPreviewValue(schema))
      ).toEqual([]);
    }
  });

  it("selects an enum value that satisfies the complete schema", () => {
    const schema = {
      type: "string",
      minLength: 2,
      enum: ["a", "valid"],
    } as JsonObject;

    expect(validateWorkflowFunctionSchema(schema)).toEqual([]);
    expect(createWorkflowFunctionPreviewValue(schema)).toBe("valid");
  });

  it("rejects contracts whose deterministic preview cannot be valid", () => {
    expect(
      validateWorkflowFunctionSchema({
        type: "integer",
        minimum: 1.5,
        maximum: 1.6,
      })
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_value", path: [] })])
    );
    expect(
      validateWorkflowFunctionSchema({
        type: "string",
        minLength: 2,
        const: "a",
      })
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_value", path: [] })])
    );
  });
});
