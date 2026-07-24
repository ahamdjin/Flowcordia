import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
} from "../../app/features/flowcordia/workflows/studio/node-configuration";

describe("Flowcordia Studio approval configuration", () => {
  it("round-trips the bounded visual approval form", () => {
    const draft = createWorkflowStudioNodeConfigurationDraft("approval.human", {
      prompt: "Approve the refund?",
      instruction: "Verify the amount.",
      timeoutSeconds: 3_600,
      requireComment: true,
    });
    expect(draft).toMatchObject({ kind: "approval", timeoutSeconds: "3600" });
    expect(buildWorkflowStudioNodeConfiguration(draft)).toEqual({
      success: true,
      configuration: {
        prompt: "Approve the refund?",
        instruction: "Verify the amount.",
        timeoutSeconds: 3_600,
        requireComment: true,
      },
    });
  });

  it("blocks unknown repository-owned approval fields instead of dropping them", () => {
    expect(
      createWorkflowStudioNodeConfigurationDraft("approval.human", {
        prompt: "Approve?",
        instruction: "",
        timeoutSeconds: 3_600,
        requireComment: false,
        quorum: 2,
      })
    ).toMatchObject({ kind: "blocked" });
  });
});
