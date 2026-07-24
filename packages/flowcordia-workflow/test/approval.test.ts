import { describe, expect, it } from "vitest";
import {
  parseFlowcordiaApprovalConfiguration,
  parseFlowcordiaApprovalResult,
  WORKFLOW_STUDIO_NODE_TEMPLATES,
} from "../src/index.js";

describe("Flowcordia human approval contract", () => {
  it("normalizes one bounded approval configuration", () => {
    expect(
      parseFlowcordiaApprovalConfiguration({
        prompt: "  Approve this order?  ",
        instruction: "  Check the refund amount. ",
        timeoutSeconds: 86_400,
        requireComment: true,
      })
    ).toEqual({
      success: true,
      configuration: {
        prompt: "Approve this order?",
        instruction: "Check the refund amount.",
        timeoutSeconds: 86_400,
        requireComment: true,
      },
    });
  });

  it("rejects unknown fields and unsafe approval bounds", () => {
    for (const value of [
      { prompt: "", instruction: "", timeoutSeconds: 86_400, requireComment: false },
      { prompt: "Approve", instruction: "", timeoutSeconds: 59, requireComment: false },
      { prompt: "Approve", instruction: "", timeoutSeconds: 86_400, requireComment: "yes" },
      {
        prompt: "Approve",
        instruction: "",
        timeoutSeconds: 86_400,
        requireComment: false,
        callbackUrl: "https://unsafe.example.com",
      },
    ]) {
      expect(parseFlowcordiaApprovalConfiguration(value as never).success).toBe(false);
    }
  });

  it("accepts only strict approval decision output", () => {
    expect(
      parseFlowcordiaApprovalResult({
        decision: "approved",
        comment: null,
        decidedAt: "2026-07-24T20:00:00.000Z",
      })
    ).toMatchObject({ success: true });
    expect(
      parseFlowcordiaApprovalResult({
        decision: "approved",
        comment: null,
        decidedAt: "2026-07-24T20:00:00.000Z",
        token: "secret",
      }).success
    ).toBe(false);
  });

  it("ships an approval template without browser callback identity", () => {
    const template = WORKFLOW_STUDIO_NODE_TEMPLATES.find(
      (candidate) => candidate.id === "approval"
    );
    expect(template).toMatchObject({ kind: "approval", operation: "approval.human" });
    expect(template?.defaultConfiguration).not.toHaveProperty("token");
    expect(template?.defaultConfiguration).not.toHaveProperty("callbackUrl");
  });
});
