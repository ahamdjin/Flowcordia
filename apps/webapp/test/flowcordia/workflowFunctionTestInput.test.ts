import type { JsonObject } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  createWorkflowFunctionTestPayload,
  removeWorkflowFunctionTestValue,
  setWorkflowFunctionTestValue,
  validateWorkflowFunctionTestPayload,
  workflowFunctionTestHasPath,
  workflowFunctionTestValueAtPath,
} from "../../app/features/flowcordia/workflows/studio/function-test-input";

const schema: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["leadId", "profile"],
  properties: {
    leadId: { type: "string", minLength: 3 },
    score: { type: "integer", minimum: 0, maximum: 100 },
    profile: {
      type: "object",
      additionalProperties: false,
      required: ["active"],
      properties: {
        active: { type: "boolean" },
        tags: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
      },
    },
  },
};

describe("schema-driven function test input", () => {
  it("creates a valid payload from required schema fields", () => {
    const payload = createWorkflowFunctionTestPayload(schema);

    expect(payload).toEqual({
      leadId: "xxx",
      profile: { active: false },
    });
    expect(validateWorkflowFunctionTestPayload(schema, payload)).toEqual([]);
  });

  it("adds, updates, and removes optional nested values immutably", () => {
    const original = createWorkflowFunctionTestPayload(schema);
    const withScore = setWorkflowFunctionTestValue(original, ["score"], 72);
    const withTags = setWorkflowFunctionTestValue(withScore, ["profile", "tags"], ["priority"]);
    const removed = removeWorkflowFunctionTestValue(withTags, ["score"]);

    expect(original).toEqual({ leadId: "xxx", profile: { active: false } });
    expect(workflowFunctionTestValueAtPath(withTags, ["score"])).toBe(72);
    expect(workflowFunctionTestValueAtPath(withTags, ["profile", "tags", 0])).toBe("priority");
    expect(workflowFunctionTestHasPath(removed, ["score"])).toBe(false);
    expect(validateWorkflowFunctionTestPayload(schema, removed)).toEqual([]);
  });

  it("returns exact contract paths for invalid form values", () => {
    const payload = setWorkflowFunctionTestValue(
      createWorkflowFunctionTestPayload(schema),
      ["leadId"],
      "x"
    );
    const invalid = setWorkflowFunctionTestValue(payload, ["profile", "tags"], []);

    expect(validateWorkflowFunctionTestPayload(schema, invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayPath: "$.leadId", code: "constraint" }),
        expect.objectContaining({ displayPath: "$.profile.tags", code: "constraint" }),
      ])
    );
  });
});
