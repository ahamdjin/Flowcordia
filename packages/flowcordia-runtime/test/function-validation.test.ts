import { describe, expect, it, vi } from "vitest";
import {
  executeFlowcordiaFunctionValidationSuite,
  flowcordiaFunctionValidationSuiteDigest,
  validateFlowcordiaFunctionValidationSuite,
  type FlowcordiaFunctionValidationDefinition,
  type FlowcordiaFunctionValidationSuite,
  type FlowcordiaFunctionValidationSuiteContent,
} from "../src/index.js";

const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["leadId"],
  properties: { leadId: { type: "string", minLength: 1 } },
} as const;
const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["qualified", "score"],
  properties: {
    qualified: { type: "boolean" },
    score: { type: "number" },
  },
} as const;

function suite(
  overrides: Partial<FlowcordiaFunctionValidationSuite> = {}
): FlowcordiaFunctionValidationSuite {
  const { suiteDigest, ...contentOverrides } = overrides;
  const content = {
    schemaVersion: "0.1",
    workflowId: "lead_intake",
    proposalId: "studio-s-validation",
    headSha: "a".repeat(40),
    cases: [
      {
        functionId: "qualify_lead",
        fixtureId: "qualified_lead",
        input: { leadId: "lead_123" },
        expectedOutput: { qualified: true, score: 90 },
      },
    ],
    ...contentOverrides,
  } satisfies FlowcordiaFunctionValidationSuiteContent;
  return {
    ...content,
    suiteDigest: suiteDigest ?? flowcordiaFunctionValidationSuiteDigest(content),
  };
}

function definitions(
  handler: FlowcordiaFunctionValidationDefinition["handler"]
): Record<string, FlowcordiaFunctionValidationDefinition> {
  return {
    qualify_lead: {
      inputSchema: { ...inputSchema },
      outputSchema: { ...outputSchema },
      handler,
    },
  };
}

describe("Flowcordia repository function validation", () => {
  it("passes exact fixture output regardless of object key order", async () => {
    const observed = vi.fn();
    const validationSuite = suite();
    const result = await executeFlowcordiaFunctionValidationSuite(
      validationSuite,
      definitions(async () => ({ score: 90, qualified: true })),
      { onCase: observed }
    );

    expect(result).toEqual({
      success: true,
      workflowId: "lead_intake",
      proposalId: "studio-s-validation",
      headSha: "a".repeat(40),
      suiteDigest: validationSuite.suiteDigest,
      passedCount: 1,
      failedCount: 0,
      cases: [
        {
          functionId: "qualify_lead",
          fixtureId: "qualified_lead",
          status: "PASSED",
        },
      ],
    });
    expect(observed).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("lead_123");
    expect(JSON.stringify(result)).not.toContain('score":90');
  });

  it("rejects invalid input before invoking repository code", async () => {
    const handler = vi.fn(async () => ({ qualified: true, score: 90 }));
    const result = await executeFlowcordiaFunctionValidationSuite(
      suite({
        cases: [
          {
            functionId: "qualify_lead",
            fixtureId: "invalid_input",
            input: { wrong: true },
            expectedOutput: { qualified: true, score: 90 },
          },
        ],
      }),
      definitions(handler)
    );

    expect(result).toMatchObject({
      success: false,
      failedCount: 1,
      cases: [{ status: "FAILED", code: "invalid_input" }],
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("distinguishes execution, output contract, and output mismatch failures", async () => {
    const thrown = await executeFlowcordiaFunctionValidationSuite(
      suite(),
      definitions(async () => {
        throw new Error("private repository error");
      })
    );
    const invalidOutput = await executeFlowcordiaFunctionValidationSuite(
      suite(),
      definitions(async () => ({ qualified: "yes", score: 90 }))
    );
    const mismatch = await executeFlowcordiaFunctionValidationSuite(
      suite(),
      definitions(async () => ({ qualified: false, score: 20 }))
    );

    expect(thrown.cases[0]).toMatchObject({ status: "FAILED", code: "execution_failed" });
    expect(invalidOutput.cases[0]).toMatchObject({ status: "FAILED", code: "invalid_output" });
    expect(mismatch.cases[0]).toMatchObject({ status: "FAILED", code: "output_mismatch" });
    expect(JSON.stringify(thrown)).not.toContain("private repository error");
  });

  it("fails closed when a referenced function is not in the deployed registry", async () => {
    const result = await executeFlowcordiaFunctionValidationSuite(suite(), {});
    expect(result.cases[0]).toMatchObject({
      status: "FAILED",
      code: "function_not_deployed",
    });
  });

  it("rejects suite content changed after its digest was created", async () => {
    const validationSuite = suite();
    validationSuite.cases[0]!.expectedOutput = { qualified: false, score: 0 };
    const handler = vi.fn(async () => ({ qualified: false, score: 0 }));

    expect(validateFlowcordiaFunctionValidationSuite(validationSuite)).toContain(
      "Function validation suiteDigest does not match the exact suite content."
    );
    await expect(
      executeFlowcordiaFunctionValidationSuite(validationSuite, definitions(handler))
    ).resolves.toMatchObject({ success: false, failureCode: "invalid_suite", cases: [] });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects unknown, duplicated, empty, and oversized suites", () => {
    expect(validateFlowcordiaFunctionValidationSuite({ ...suite(), injected: true })).toContain(
      'Unknown function validation suite property "injected".'
    );
    expect(validateFlowcordiaFunctionValidationSuite(suite({ cases: [] }))).toContain(
      "Function validation requires at least one case."
    );
    const duplicate = suite();
    duplicate.cases.push({ ...duplicate.cases[0]! });
    expect(validateFlowcordiaFunctionValidationSuite(duplicate)).toContain(
      'Duplicate function validation case "qualify_lead/qualified_lead".'
    );
    expect(validateFlowcordiaFunctionValidationSuite(suite(), { maxBytes: 10 })).toContain(
      "Function validation suite exceeds 10 bytes."
    );
  });

  it("does not let metadata observation change validation behavior", async () => {
    const result = await executeFlowcordiaFunctionValidationSuite(
      suite(),
      definitions(async () => ({ qualified: true, score: 90 })),
      {
        onCase() {
          throw new Error("metadata unavailable");
        },
      }
    );
    expect(result.success).toBe(true);
  });
});
