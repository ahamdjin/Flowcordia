import type { FlowcordiaApprovalIdentity } from "./contract";

export const FLOWCORDIA_APPROVAL_NOTIFICATION_BATCH_LIMIT = 50;
export const FLOWCORDIA_APPROVAL_NOTIFICATION_SCAN_LIMIT = 200;
export const FLOWCORDIA_APPROVAL_NOTIFICATION_LEASE_MS = 60_000;
export const FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS = 8;

export type FlowcordiaApprovalNotificationStage = "REMINDER" | "ESCALATION";
export type FlowcordiaApprovalNotificationTerminalStatus = "SENT" | "FAILED" | "CANCELLED";
export type FlowcordiaApprovalNotificationFailureCode =
  | "CHANNEL_INELIGIBLE"
  | "CHANNEL_INVALID"
  | "DELIVERY_EXHAUSTED"
  | "PROVIDER_REJECTED"
  | "WAITPOINT_CLOSED";

export interface FlowcordiaApprovalNotificationChannelInput {
  enabled: boolean;
  environmentTypes: readonly string[];
  alertTypes: readonly string[];
}

export interface FlowcordiaApprovalNotificationMessageInput {
  deliveryId: string;
  stage: FlowcordiaApprovalNotificationStage;
  prompt: string;
  instruction: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  projectName: string;
  environmentSlug: string;
  timeoutAt: string;
  dashboardUrl: string;
}

export function flowcordiaApprovalNotificationStageDue(
  identity: Pick<FlowcordiaApprovalIdentity, "reminderAt" | "escalationAt" | "timeoutAt">,
  now: Date
): FlowcordiaApprovalNotificationStage | null {
  const current = now.getTime();
  const timeout = Date.parse(identity.timeoutAt);
  if (!Number.isFinite(timeout) || current >= timeout) return null;
  if (identity.escalationAt !== null && Date.parse(identity.escalationAt) <= current) {
    return "ESCALATION";
  }
  if (identity.reminderAt !== null && Date.parse(identity.reminderAt) <= current) {
    return "REMINDER";
  }
  return null;
}

export function isFlowcordiaApprovalNotificationChannelEligible(
  channel: FlowcordiaApprovalNotificationChannelInput,
  environmentType: string
): boolean {
  return (
    channel.enabled &&
    channel.environmentTypes.includes(environmentType) &&
    channel.alertTypes.includes("TASK_RUN") &&
    channel.alertTypes.includes("DEPLOYMENT_FAILURE")
  );
}

export function flowcordiaApprovalNotificationRetryDelayMs(attempt: number): number {
  const boundedAttempt = Math.max(1, Math.min(FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS, attempt));
  return Math.min(3_600_000, 30_000 * 2 ** (boundedAttempt - 1));
}

export function flowcordiaApprovalNotificationSubject(
  stage: FlowcordiaApprovalNotificationStage,
  prompt: string
): string {
  const prefix = stage === "ESCALATION" ? "Approval escalated" : "Approval reminder";
  return `[Flowcordia] ${prefix}: ${prompt}`.slice(0, 180);
}

export function flowcordiaApprovalNotificationText(
  input: FlowcordiaApprovalNotificationMessageInput
): string {
  const stageLabel = input.stage === "ESCALATION" ? "Escalation" : "Reminder";
  const instruction = input.instruction.trim()
    ? `\nInstruction: ${input.instruction.trim()}`
    : "";
  return [
    `${stageLabel}: a Flowcordia workflow is waiting for a human decision.`,
    `Project: ${input.projectName}`,
    `Environment: ${input.environmentSlug}`,
    `Workflow: ${input.workflowId}`,
    `Run: ${input.runId}`,
    `Node: ${input.nodeId}`,
    `Prompt: ${input.prompt}${instruction}`,
    `Timeout: ${input.timeoutAt}`,
    `Open approval inbox: ${input.dashboardUrl}`,
    `Delivery ID: ${input.deliveryId}`,
  ].join("\n");
}

export function flowcordiaApprovalNotificationFailureState(input: {
  attempt: number;
  retryable: boolean;
  now: Date;
}):
  | {
      status: "PENDING";
      availableAt: Date;
      failureCode: "PROVIDER_REJECTED";
    }
  | {
      status: "FAILED";
      availableAt: Date;
      failureCode: "DELIVERY_EXHAUSTED" | "PROVIDER_REJECTED";
    } {
  if (!input.retryable) {
    return {
      status: "FAILED",
      availableAt: input.now,
      failureCode: "PROVIDER_REJECTED",
    };
  }
  if (input.attempt >= FLOWCORDIA_APPROVAL_NOTIFICATION_MAX_ATTEMPTS) {
    return {
      status: "FAILED",
      availableAt: input.now,
      failureCode: "DELIVERY_EXHAUSTED",
    };
  }
  return {
    status: "PENDING",
    availableAt: new Date(
      input.now.getTime() + flowcordiaApprovalNotificationRetryDelayMs(input.attempt)
    ),
    failureCode: "PROVIDER_REJECTED",
  };
}
