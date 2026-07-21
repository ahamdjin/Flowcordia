export type FlowcordiaOperationsCheckState = "READY" | "ATTENTION" | "BLOCKED";

export interface FlowcordiaOperationsThresholds {
  outboxAttentionAgeMs: number;
  outboxBlockedAgeMs: number;
  reconciliationAttentionAgeMs: number;
  reconciliationBlockedAgeMs: number;
}

export interface FlowcordiaOperationsMetrics {
  workerActive: boolean;
  workerHeartbeatAgeMs: number | null;
  unpublishedOutboxCount: number;
  oldestUnpublishedOutboxAgeMs: number | null;
  maximumOutboxAttempts: number;
  expiredOutboxLocks: number;
  pendingReconciliationCount: number;
  oldestReconciliationDelayMs: number | null;
  maximumReconciliationAttempts: number;
  expiredReconciliationLocks: number;
  staleReconcilingProposalCount: number;
  recentFailedProposalCount: number;
  thresholds: FlowcordiaOperationsThresholds;
}

export interface FlowcordiaOperationsCheck {
  key: "worker" | "outbox" | "reconciliation" | "leases" | "proposals";
  state: FlowcordiaOperationsCheckState;
  message: string;
  count: number | null;
  ageSeconds: number | null;
  attempts: number | null;
}

export interface FlowcordiaOperationsProjection {
  state: FlowcordiaOperationsCheckState;
  message: string;
  checkedAt: string;
  checks: FlowcordiaOperationsCheck[];
}

function safeNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
}

function validateMetrics(metrics: FlowcordiaOperationsMetrics): void {
  const integers: Array<[number, string]> = [
    [metrics.unpublishedOutboxCount, "Unpublished outbox count"],
    [metrics.maximumOutboxAttempts, "Maximum outbox attempts"],
    [metrics.expiredOutboxLocks, "Expired outbox locks"],
    [metrics.pendingReconciliationCount, "Pending reconciliation count"],
    [metrics.maximumReconciliationAttempts, "Maximum reconciliation attempts"],
    [metrics.expiredReconciliationLocks, "Expired reconciliation locks"],
    [metrics.staleReconcilingProposalCount, "Stale reconciling proposal count"],
    [metrics.recentFailedProposalCount, "Recent failed proposal count"],
    [metrics.thresholds.outboxAttentionAgeMs, "Outbox attention age"],
    [metrics.thresholds.outboxBlockedAgeMs, "Outbox blocked age"],
    [metrics.thresholds.reconciliationAttentionAgeMs, "Reconciliation attention age"],
    [metrics.thresholds.reconciliationBlockedAgeMs, "Reconciliation blocked age"],
  ];
  for (const [value, label] of integers) safeNonNegativeInteger(value, label);
  for (const [value, label] of [
    [metrics.workerHeartbeatAgeMs, "Worker heartbeat age"],
    [metrics.oldestUnpublishedOutboxAgeMs, "Oldest unpublished outbox age"],
    [metrics.oldestReconciliationDelayMs, "Oldest reconciliation delay"],
  ] as const) {
    if (value !== null) safeNonNegativeInteger(value, label);
  }
  if (
    metrics.thresholds.outboxAttentionAgeMs === 0 ||
    metrics.thresholds.reconciliationAttentionAgeMs === 0 ||
    metrics.thresholds.outboxBlockedAgeMs < metrics.thresholds.outboxAttentionAgeMs ||
    metrics.thresholds.reconciliationBlockedAgeMs < metrics.thresholds.reconciliationAttentionAgeMs
  ) {
    throw new TypeError("Operations readiness thresholds are invalid.");
  }
}

function ageSeconds(value: number | null): number | null {
  return value === null ? null : Math.floor(value / 1_000);
}

function queueState(input: {
  count: number;
  ageMs: number | null;
  attempts: number;
  attentionAgeMs: number;
  blockedAgeMs: number;
}): FlowcordiaOperationsCheckState {
  if (input.count === 0) return "READY";
  if (input.ageMs !== null && input.ageMs >= input.blockedAgeMs) return "BLOCKED";
  if (input.attempts > 0 || (input.ageMs !== null && input.ageMs >= input.attentionAgeMs)) {
    return "ATTENTION";
  }
  return "READY";
}

function highest(
  states: readonly FlowcordiaOperationsCheckState[]
): FlowcordiaOperationsCheckState {
  if (states.includes("BLOCKED")) return "BLOCKED";
  if (states.includes("ATTENTION")) return "ATTENTION";
  return "READY";
}

export function presentFlowcordiaOperationsHealth(input: {
  metrics: FlowcordiaOperationsMetrics;
  checkedAt: Date;
}): FlowcordiaOperationsProjection {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new TypeError("Operations check time is invalid.");
  }
  validateMetrics(input.metrics);
  const metrics = input.metrics;
  const outboxState = queueState({
    count: metrics.unpublishedOutboxCount,
    ageMs: metrics.oldestUnpublishedOutboxAgeMs,
    attempts: metrics.maximumOutboxAttempts,
    attentionAgeMs: metrics.thresholds.outboxAttentionAgeMs,
    blockedAgeMs: metrics.thresholds.outboxBlockedAgeMs,
  });
  const reconciliationState = queueState({
    count: metrics.pendingReconciliationCount,
    ageMs: metrics.oldestReconciliationDelayMs,
    attempts: metrics.maximumReconciliationAttempts,
    attentionAgeMs: metrics.thresholds.reconciliationAttentionAgeMs,
    blockedAgeMs: metrics.thresholds.reconciliationBlockedAgeMs,
  });
  const expiredLeaseCount = metrics.expiredOutboxLocks + metrics.expiredReconciliationLocks;
  safeNonNegativeInteger(expiredLeaseCount, "Expired lease count");
  const proposalCount = metrics.staleReconcilingProposalCount + metrics.recentFailedProposalCount;
  safeNonNegativeInteger(proposalCount, "Proposal health count");
  const proposalState: FlowcordiaOperationsCheckState =
    metrics.staleReconcilingProposalCount > 0
      ? "BLOCKED"
      : metrics.recentFailedProposalCount > 0
        ? "ATTENTION"
        : "READY";

  const checks: FlowcordiaOperationsCheck[] = [
    {
      key: "worker",
      state: metrics.workerActive ? "READY" : "BLOCKED",
      message: metrics.workerActive
        ? "A proposal operations worker heartbeat is active."
        : "No active proposal operations worker heartbeat was observed.",
      count: null,
      ageSeconds: ageSeconds(metrics.workerHeartbeatAgeMs),
      attempts: null,
    },
    {
      key: "outbox",
      state: outboxState,
      message:
        metrics.unpublishedOutboxCount === 0
          ? "No unpublished lifecycle events are waiting."
          : outboxState === "BLOCKED"
            ? "Lifecycle event publication is outside the release objective."
            : outboxState === "ATTENTION"
              ? "Lifecycle event publication is delayed or retrying."
              : "Lifecycle events are queued within the expected delivery window.",
      count: metrics.unpublishedOutboxCount,
      ageSeconds: ageSeconds(metrics.oldestUnpublishedOutboxAgeMs),
      attempts: metrics.maximumOutboxAttempts,
    },
    {
      key: "reconciliation",
      state: reconciliationState,
      message:
        metrics.pendingReconciliationCount === 0
          ? "No due proposal reconciliation work is waiting."
          : reconciliationState === "BLOCKED"
            ? "Proposal reconciliation is outside the release objective."
            : reconciliationState === "ATTENTION"
              ? "Proposal reconciliation is delayed or retrying."
              : "Proposal reconciliation is due within the expected processing window.",
      count: metrics.pendingReconciliationCount,
      ageSeconds: ageSeconds(metrics.oldestReconciliationDelayMs),
      attempts: metrics.maximumReconciliationAttempts,
    },
    {
      key: "leases",
      state: expiredLeaseCount > 0 ? "BLOCKED" : "READY",
      message:
        expiredLeaseCount > 0
          ? "Expired operation leases require worker and database investigation."
          : "No expired outbox or reconciliation leases were observed.",
      count: expiredLeaseCount,
      ageSeconds: null,
      attempts: null,
    },
    {
      key: "proposals",
      state: proposalState,
      message:
        metrics.staleReconcilingProposalCount > 0
          ? "One or more proposals remain stale in reconciliation."
          : metrics.recentFailedProposalCount > 0
            ? "Recent terminal proposal failures require operator review."
            : "No stale reconciling or recent failed proposals were observed.",
      count: proposalCount,
      ageSeconds: null,
      attempts: null,
    },
  ];
  const state = highest(checks.map((check) => check.state));
  return {
    state,
    message:
      state === "READY"
        ? "Flowcordia proposal operations are within the release objectives."
        : state === "ATTENTION"
          ? "Flowcordia proposal operations need review before release acceptance."
          : "Flowcordia proposal operations are not ready for production release.",
    checkedAt: input.checkedAt.toISOString(),
    checks,
  };
}
