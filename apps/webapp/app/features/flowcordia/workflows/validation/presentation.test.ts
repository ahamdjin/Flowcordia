import { describe, expect, it } from "vitest";
import {
  presentFlowcordiaFunctionValidationMetadata,
  presentFlowcordiaFunctionValidationRunIdentity,
} from "./presentation";

const expected = {
  workflowId: "lead_intake",
  proposalId: "studio-s-validation",
  headSha: "a".repeat(40),
  suiteDigest: "b".repeat(64),
};

function metadata(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    flowcordiaValidationTrigger: { ...expected },
    flowcordiaValidation: {
      schemaVersion: "0.1",
      ...expected,
      status: "PASSED",
      passedCount: 1,
      failedCount: 0,
      failureCode: null,
      cases: [
        {
          functionId: "qualify_lead",
          fixtureId: "qualified_lead",
          status: "PASSED",
        },
      ],
      updatedAt: "2026-07-18T20:00:00.000Z",
      ...overrides,
    },
  });
}

describe("Flowcordia function validation presentation", () => {
  it("finds queued run identity from server-owned trigger metadata", () => {
    expect(
      presentFlowcordiaFunctionValidationRunIdentity(
        JSON.stringify({ flowcordiaValidationTrigger: expected })
      )
    ).toEqual(expected);
  });

  it("projects only bounded exact-head validation status", () => {
    expect(presentFlowcordiaFunctionValidationMetadata(metadata(), expected)).toEqual({
      status: "PASSED",
      passedCount: 1,
      failedCount: 0,
      failureCode: null,
      cases: [
        {
          functionId: "qualify_lead",
          fixtureId: "qualified_lead",
          status: "PASSED",
          code: null,
        },
      ],
    });
  });

  it("rejects wrong-head, inconsistent, duplicated, and extended metadata", () => {
    expect(
      presentFlowcordiaFunctionValidationMetadata(metadata({ headSha: "c".repeat(40) }), expected)
    ).toBeNull();
    expect(
      presentFlowcordiaFunctionValidationMetadata(metadata({ passedCount: 2 }), expected)
    ).toBeNull();
    expect(
      presentFlowcordiaFunctionValidationMetadata(
        metadata({
          cases: [
            {
              functionId: "qualify_lead",
              fixtureId: "qualified_lead",
              status: "PASSED",
            },
            {
              functionId: "qualify_lead",
              fixtureId: "qualified_lead",
              status: "PASSED",
            },
          ],
          passedCount: 2,
        }),
        expected
      )
    ).toBeNull();
    expect(
      presentFlowcordiaFunctionValidationMetadata(metadata({ sourceText: "private" }), expected)
    ).toBeNull();
    expect(
      presentFlowcordiaFunctionValidationMetadata(
        metadata({
          cases: [
            {
              functionId: "qualify_lead",
              fixtureId: "qualified_lead",
              status: "PASSED",
              input: { secret: "private" },
            },
          ],
        }),
        expected
      )
    ).toBeNull();
  });

  it("rejects passed status when no executable case was proven", () => {
    expect(
      presentFlowcordiaFunctionValidationMetadata(metadata({ cases: [], passedCount: 0 }), expected)
    ).toBeNull();
  });
});
