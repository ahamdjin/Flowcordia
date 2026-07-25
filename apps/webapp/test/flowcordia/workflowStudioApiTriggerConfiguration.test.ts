import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
} from "../../app/features/flowcordia/workflows/studio/node-configuration";

describe("Flowcordia Studio API trigger configuration", () => {
  it("round-trips idempotency and queue TTL controls", () => {
    const draft = createWorkflowStudioNodeConfigurationDraft("trigger.api", {
      requireIdempotencyKey: true,
      idempotencyKeyTTLSeconds: 7_200,
      queueTTLSeconds: 900,
    });
    expect(draft).toEqual({
      kind: "api_trigger",
      requireIdempotencyKey: true,
      idempotencyKeyTTLSeconds: "7200",
      queueTTLSeconds: "900",
    });
    expect(buildWorkflowStudioNodeConfiguration(draft)).toEqual({
      success: true,
      configuration: {
        requireIdempotencyKey: true,
        idempotencyKeyTTLSeconds: 7_200,
        queueTTLSeconds: 900,
      },
    });
  });

  it("defaults legacy API triggers and blocks unknown repository-owned fields", () => {
    expect(createWorkflowStudioNodeConfigurationDraft("trigger.api", {})).toEqual({
      kind: "api_trigger",
      requireIdempotencyKey: true,
      idempotencyKeyTTLSeconds: "86400",
      queueTTLSeconds: "3600",
    });
    expect(
      createWorkflowStudioNodeConfigurationDraft("trigger.api", {
        mode: "payload-hash",
      })
    ).toMatchObject({ kind: "blocked" });
  });
});
