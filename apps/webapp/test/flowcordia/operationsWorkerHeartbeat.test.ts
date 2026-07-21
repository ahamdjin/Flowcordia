import { describe, expect, it } from "vitest";
import { flowcordiaOperationsHeartbeatTiming } from "../../app/features/flowcordia/proposals/worker/heartbeat";

describe("Flowcordia operations worker heartbeat timing", () => {
  it("keeps a fast worker observable across delayed request-serving replicas", () => {
    expect(flowcordiaOperationsHeartbeatTiming(250)).toEqual({
      heartbeatIntervalMs: 1_000,
      healthyWindowMs: 30_000,
    });
  });

  it("bounds slow-worker writes while preserving a multi-heartbeat health window", () => {
    expect(flowcordiaOperationsHeartbeatTiming(60_000)).toEqual({
      heartbeatIntervalMs: 15_000,
      healthyWindowMs: 45_000,
    });
  });

  it.each([0, 249, 3_600_001, 1.5, Number.NaN])("rejects an invalid poll interval: %s", (value) => {
    expect(() => flowcordiaOperationsHeartbeatTiming(value)).toThrow(
      "Flowcordia worker poll interval is invalid."
    );
  });
});
