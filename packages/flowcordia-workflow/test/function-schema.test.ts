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
});
