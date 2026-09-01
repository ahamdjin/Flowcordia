import type { JsonObject } from "./types.js";

export type FlowcordiaWaitConfiguration =
  | (JsonObject & {
      mode: "duration";
      durationSeconds: number;
    })
  | (JsonObject & {
      mode: "until";
      untilTimestamp: string;
    });

export type FlowcordiaWaitConfigurationResult =
  | { success: true; configuration: FlowcordiaWaitConfiguration }
  | { success: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseFlowcordiaWaitConfiguration(
  value: unknown
): FlowcordiaWaitConfigurationResult {
  if (!isRecord(value)) {
    return { success: false, message: "Wait configuration must be an object." };
  }

  const mode = value.mode ?? ("untilTimestamp" in value ? "until" : "duration");
  if (mode === "duration") {
    const durationSeconds = value.durationSeconds;
    if (
      typeof durationSeconds !== "number" ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0
    ) {
      return {
        success: false,
        message: "Delay For requires a non-negative duration in seconds.",
      };
    }
    return { success: true, configuration: { mode, durationSeconds } };
  }

  if (mode === "until") {
    const untilTimestamp =
      typeof value.untilTimestamp === "string" ? value.untilTimestamp.trim() : "";
    if (!untilTimestamp || !Number.isFinite(Date.parse(untilTimestamp))) {
      return {
        success: false,
        message: "Delay Until requires a valid date and time.",
      };
    }
    return {
      success: true,
      configuration: { mode, untilTimestamp: new Date(untilTimestamp).toISOString() },
    };
  }

  return { success: false, message: "Wait mode must be duration or until." };
}
