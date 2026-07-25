import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
} from "~/features/flowcordia/workflows/studio/node-configuration";

describe("Flowcordia approval escalation Studio contract", () => {
  it("round-trips optional reminder and escalation fields", () => {
    const draft = createWorkflowStudioNodeConfigurationDraft("approval.human", {
      prompt: "Approve this change?",
      instruction: "Check the release evidence.",
      timeoutSeconds: 3_600,
      requireComment: true,
      reminderAfterSeconds: 600,
      escalationAfterSeconds: 1_800,
    });
    expect(draft).toMatchObject({
      kind: "approval",
      reminderAfterSeconds: "600",
      escalationAfterSeconds: "1800",
    });
    expect(buildWorkflowStudioNodeConfiguration(draft)).toMatchObject({
      success: true,
      configuration: { reminderAfterSeconds: 600, escalationAfterSeconds: 1_800 },
    });
  });

  it("keeps disabled policy fields as null and fails closed on invalid ordering", () => {
    expect(
      buildWorkflowStudioNodeConfiguration({
        kind: "approval",
        prompt: "Approve",
        instruction: "",
        timeoutSeconds: "3600",
        requireComment: false,
        reminderAfterSeconds: "",
        escalationAfterSeconds: "",
      })
    ).toMatchObject({
      success: true,
      configuration: { reminderAfterSeconds: null, escalationAfterSeconds: null },
    });
    expect(
      buildWorkflowStudioNodeConfiguration({
        kind: "approval",
        prompt: "Approve",
        instruction: "",
        timeoutSeconds: "3600",
        requireComment: false,
        reminderAfterSeconds: "1800",
        escalationAfterSeconds: "600",
      }).success
    ).toBe(false);
  });
});
