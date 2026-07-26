export class FlowcordiaApprovalNotificationClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowcordiaApprovalNotificationClockError";
  }
}

export function flowcordiaApprovalNotificationProcessingTime(
  scheduledAt: Date,
  observedAt: Date
): Date {
  const scheduled = scheduledAt.getTime();
  const observed = observedAt.getTime();
  if (!Number.isFinite(scheduled) || !Number.isFinite(observed)) {
    throw new FlowcordiaApprovalNotificationClockError(
      "Approval notification processing time is invalid."
    );
  }
  return new Date(Math.max(scheduled, observed));
}
