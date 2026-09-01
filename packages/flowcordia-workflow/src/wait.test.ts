import { describe, expect, it } from "vitest";
import { parseFlowcordiaWaitConfiguration } from "./wait";

describe("parseFlowcordiaWaitConfiguration", () => {
  it("keeps legacy duration configurations compatible", () => {
    expect(parseFlowcordiaWaitConfiguration({ durationSeconds: 30 })).toEqual({
      success: true,
      configuration: { mode: "duration", durationSeconds: 30 },
    });
  });

  it("normalizes Delay Until timestamps", () => {
    expect(
      parseFlowcordiaWaitConfiguration({
        mode: "until",
        untilTimestamp: "2026-09-02T14:30:00+05:00",
      })
    ).toEqual({
      success: true,
      configuration: { mode: "until", untilTimestamp: "2026-09-02T09:30:00.000Z" },
    });
  });

  it("rejects invalid delay values", () => {
    expect(parseFlowcordiaWaitConfiguration({ mode: "duration", durationSeconds: -1 })).toEqual({
      success: false,
      message: "Delay For requires a non-negative duration in seconds.",
    });
    expect(parseFlowcordiaWaitConfiguration({ mode: "until", untilTimestamp: "tomorrow" })).toEqual(
      {
        success: false,
        message: "Delay Until requires a valid date and time.",
      }
    );
  });
});
