import { describe, expect, it } from "vitest";
import {
  FlowcordiaApprovalNotificationClockError,
  flowcordiaApprovalNotificationProcessingTime,
} from "~/features/flowcordia/workflows/approval/notification-clock";
import { flowcordiaApprovalNotificationStageDue } from "~/features/flowcordia/workflows/approval/notification";

describe("Flowcordia approval notification processing clock", () => {
  const identity = {
    reminderAt: "2026-07-26T00:10:00.000Z",
    escalationAt: "2026-07-26T00:20:00.000Z",
    timeoutAt: "2026-07-26T01:00:00.000Z",
  };

  it("uses wall-clock time when cron processing is delayed past approval timeout", () => {
    const processingTime = flowcordiaApprovalNotificationProcessingTime(
      new Date("2026-07-26T00:15:00.000Z"),
      new Date("2026-07-26T01:05:00.000Z")
    );

    expect(processingTime.toISOString()).toBe("2026-07-26T01:05:00.000Z");
    expect(flowcordiaApprovalNotificationStageDue(identity, processingTime)).toBeNull();
  });

  it("does not move before the scheduled timestamp when clocks are skewed", () => {
    expect(
      flowcordiaApprovalNotificationProcessingTime(
        new Date("2026-07-26T00:15:00.000Z"),
        new Date("2026-07-26T00:14:59.000Z")
      ).toISOString()
    ).toBe("2026-07-26T00:15:00.000Z");
  });

  it("rejects invalid timestamps", () => {
    expect(() =>
      flowcordiaApprovalNotificationProcessingTime(
        new Date("invalid"),
        new Date("2026-07-26T00:15:00.000Z")
      )
    ).toThrow(FlowcordiaApprovalNotificationClockError);
  });
});
