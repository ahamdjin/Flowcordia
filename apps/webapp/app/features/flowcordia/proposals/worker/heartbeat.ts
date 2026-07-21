const MIN_HEARTBEAT_INTERVAL_MS = 1_000;
const MAX_HEARTBEAT_INTERVAL_MS = 15_000;
const MIN_HEALTHY_WINDOW_MS = 30_000;

export interface FlowcordiaOperationsHeartbeatTiming {
  heartbeatIntervalMs: number;
  healthyWindowMs: number;
}

export function flowcordiaOperationsHeartbeatTiming(
  pollIntervalMs: number
): FlowcordiaOperationsHeartbeatTiming {
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 250 || pollIntervalMs > 3_600_000) {
    throw new TypeError("Flowcordia worker poll interval is invalid.");
  }
  const heartbeatIntervalMs = Math.min(
    MAX_HEARTBEAT_INTERVAL_MS,
    Math.max(MIN_HEARTBEAT_INTERVAL_MS, pollIntervalMs)
  );
  return {
    heartbeatIntervalMs,
    healthyWindowMs: Math.max(MIN_HEALTHY_WINDOW_MS, heartbeatIntervalMs * 3),
  };
}
