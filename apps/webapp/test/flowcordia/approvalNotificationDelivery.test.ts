import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS,
  flowcordiaApprovalNotificationFailureState,
  flowcordiaApprovalNotificationRetryDelayMs,
  flowcordiaApprovalNotificationStageDue,
  flowcordiaApprovalNotificationSubject,
  flowcordiaApprovalNotificationText,
  isFlowcordiaApprovalNotificationChannelEligible,
} from "~/features/flowcordia/workflows/approval/notification";

describe("Flowcordia approval notification delivery", () => {
  const identity = {
    reminderAt: "2026-07-26T00:10:00.000Z",
    escalationAt: "2026-07-26T00:20:00.000Z",
    timeoutAt: "2026-07-26T01:00:00.000Z",
  };

  it("projects one current stage and lets escalation supersede a missed reminder", () => {
    expect(
      flowcordiaApprovalNotificationStageDue(identity, new Date("2026-07-26T00:09:59.000Z"))
    ).toBeNull();
    expect(
      flowcordiaApprovalNotificationStageDue(identity, new Date("2026-07-26T00:15:00.000Z"))
    ).toBe("REMINDER");
    expect(
      flowcordiaApprovalNotificationStageDue(identity, new Date("2026-07-26T00:25:00.000Z"))
    ).toBe("ESCALATION");
    expect(
      flowcordiaApprovalNotificationStageDue(identity, new Date("2026-07-26T01:00:00.000Z"))
    ).toBeNull();
  });

  it("uses only enabled operational channels covering the current environment", () => {
    expect(
      isFlowcordiaApprovalNotificationChannelEligible(
        {
          enabled: true,
          environmentTypes: ["PRODUCTION"],
          alertTypes: ["TASK_RUN", "DEPLOYMENT_FAILURE"],
        },
        "PRODUCTION"
      )
    ).toBe(true);
    expect(
      isFlowcordiaApprovalNotificationChannelEligible(
        {
          enabled: false,
          environmentTypes: ["PRODUCTION"],
          alertTypes: ["TASK_RUN", "DEPLOYMENT_FAILURE"],
        },
        "PRODUCTION"
      )
    ).toBe(false);
    expect(
      isFlowcordiaApprovalNotificationChannelEligible(
        {
          enabled: true,
          environmentTypes: ["STAGING"],
          alertTypes: ["TASK_RUN", "DEPLOYMENT_FAILURE"],
        },
        "PRODUCTION"
      )
    ).toBe(false);
    expect(
      isFlowcordiaApprovalNotificationChannelEligible(
        {
          enabled: true,
          environmentTypes: ["PRODUCTION"],
          alertTypes: ["TASK_RUN"],
        },
        "PRODUCTION"
      )
    ).toBe(false);
  });

  it("backs off retryable provider failures and terminates bounded attempts", () => {
    expect(flowcordiaApprovalNotificationRetryDelayMs(1)).toBe(30_000);
    expect(flowcordiaApprovalNotificationRetryDelayMs(2)).toBe(60_000);
    expect(flowcordiaApprovalNotificationRetryDelayMs(20)).toBeLessThanOrEqual(3_600_000);

    const now = new Date("2026-07-26T00:00:00.000Z");
    expect(
      flowcordiaApprovalNotificationFailureState({ attempt: 1, retryable: true, now })
    ).toEqual({
      status: "PENDING",
      availableAt: new Date("2026-07-26T00:00:30.000Z"),
      failureCode: "PROVIDER_REJECTED",
    });
    expect(
      flowcordiaApprovalNotificationFailureState({
        attempt: FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS,
        retryable: true,
        now,
      })
    ).toEqual({
      status: "FAILED",
      availableAt: now,
      failureCode: "DELIVERY_EXHAUSTED",
    });
    expect(
      flowcordiaApprovalNotificationFailureState({ attempt: 1, retryable: false, now })
    ).toEqual({
      status: "FAILED",
      availableAt: now,
      failureCode: "PROVIDER_REJECTED",
    });
  });

  it("builds bounded messages around stable public identities", () => {
    const input = {
      deliveryId: "delivery_123",
      stage: "ESCALATION" as const,
      prompt: "Approve the production release?",
      instruction: "Review the attached launch evidence.",
      workflowId: "release-workflow",
      runId: "run_123",
      nodeId: "approval",
      projectName: "Flowcordia",
      environmentSlug: "prod",
      timeoutAt: "2026-07-26T01:00:00.000Z",
      dashboardUrl: "https://app.example.com/projects/v3/proj_123",
    };
    expect(flowcordiaApprovalNotificationSubject(input.stage, input.prompt)).toBe(
      "[Flowcordia] Approval escalated: Approve the production release?"
    );
    const text = flowcordiaApprovalNotificationText(input);
    expect(text).toContain("Delivery ID: delivery_123");
    expect(text).toContain("Run: run_123");
    expect(text).toContain("Open approval inbox: https://app.example.com/projects/v3/proj_123");
    expect(text).not.toContain("token");
    expect(text).not.toContain("payload");
  });
});
