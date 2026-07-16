import type { JsonValue } from "../types.js";

type UnknownRecord = Record<string, unknown>;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DECIMAL_ID_PATTERN = /^[1-9][0-9]{0,39}$/;

interface WebhookBase {
  eventName: "pull_request" | "pull_request_review" | "check_run" | "check_suite" | "status";
  action: string | null;
  installationId: number;
  repositoryGithubId: string;
  pullRequestNumber: number | null;
  headSha: string | null;
  occurredAt: Date;
}

export interface PullRequestWebhook extends WebhookBase {
  eventName: "pull_request";
  pullRequestNumber: number;
  headSha: string;
  headBranch: string;
  baseBranch: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  mergeCommitSha: string | null;
}

export interface PullRequestReviewWebhook extends WebhookBase {
  eventName: "pull_request_review";
  pullRequestNumber: number;
  headSha: string;
  reviewerId: string;
  reviewState: "approved" | "changes_requested" | "commented" | "dismissed" | "pending";
  reviewCommitSha: string | null;
}

export interface CheckWebhook extends WebhookBase {
  eventName: "check_run" | "check_suite";
  headSha: string;
  checkName: string;
  checkStatus: string;
  checkConclusion: string | null;
}

export interface CommitStatusWebhook extends WebhookBase {
  eventName: "status";
  headSha: string;
  context: string;
  statusState: string;
}

export type NormalizedGitHubWebhook =
  | PullRequestWebhook
  | PullRequestReviewWebhook
  | CheckWebhook
  | CommitStatusWebhook;

export type WebhookNormalizationResult =
  | { success: true; supported: false }
  | { success: true; supported: true; value: NormalizedGitHubWebhook }
  | { success: false; error: string };

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function decimalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && DECIMAL_ID_PATTERN.test(value)) return value;
  return undefined;
}

function objectId(value: unknown): string | undefined {
  return typeof value === "string" && OBJECT_ID_PATTERN.test(value) ? value : undefined;
}

function date(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function boundedString(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    ? value
    : undefined;
}

function common(payload: UnknownRecord) {
  const installation = record(payload.installation);
  const repository = record(payload.repository);
  const installationId = positiveInteger(installation?.id);
  const repositoryGithubId = decimalId(repository?.id);
  return installationId && repositoryGithubId ? { installationId, repositoryGithubId } : undefined;
}

function pullRequestNumberFromList(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const number = positiveInteger(record(item)?.number);
    if (number) return number;
  }
  return null;
}

export function normalizeGitHubWebhook(
  eventName: string,
  payload: unknown
): WebhookNormalizationResult {
  if (
    !["pull_request", "pull_request_review", "check_run", "check_suite", "status"].includes(
      eventName
    )
  ) {
    return { success: true, supported: false };
  }
  const root = record(payload);
  const binding = root && common(root);
  if (!root || !binding) return { success: false, error: "Webhook tenant binding is invalid." };
  const action = root.action == null ? null : boundedString(root.action, 100);
  if (root.action != null && !action) {
    return { success: false, error: "Webhook action is invalid." };
  }
  const normalizedAction = action ?? null;

  if (eventName === "pull_request") {
    const pull = record(root.pull_request);
    const head = record(pull?.head);
    const base = record(pull?.base);
    const pullRequestNumber = positiveInteger(pull?.number);
    const headSha = objectId(head?.sha);
    const headBranch = boundedString(head?.ref, 1024);
    const baseBranch = boundedString(base?.ref, 1024);
    const occurredAt = date(pull?.updated_at);
    const mergeCommitSha =
      pull?.merge_commit_sha === null ? null : objectId(pull?.merge_commit_sha);
    if (
      !pull ||
      !pullRequestNumber ||
      !headSha ||
      !occurredAt ||
      !headBranch ||
      !baseBranch ||
      (pull.state !== "open" && pull.state !== "closed") ||
      typeof pull.draft !== "boolean" ||
      typeof pull.merged !== "boolean" ||
      (pull.merge_commit_sha !== null && !mergeCommitSha)
    ) {
      return { success: false, error: "Pull request webhook payload is invalid." };
    }
    return {
      success: true,
      supported: true,
      value: {
        eventName,
        action: normalizedAction,
        ...binding,
        pullRequestNumber,
        headSha,
        headBranch,
        baseBranch,
        state: pull.state,
        draft: pull.draft,
        merged: pull.merged,
        mergeCommitSha: mergeCommitSha ?? null,
        occurredAt,
      },
    };
  }

  if (eventName === "pull_request_review") {
    const pull = record(root.pull_request);
    const head = record(pull?.head);
    const review = record(root.review);
    const user = record(review?.user);
    const pullRequestNumber = positiveInteger(pull?.number);
    const headSha = objectId(head?.sha);
    const reviewerId = decimalId(user?.id);
    const occurredAt = date(review?.submitted_at ?? pull?.updated_at);
    const reviewState = typeof review?.state === "string" ? review.state.toLowerCase() : "";
    const reviewCommitSha = review?.commit_id == null ? null : objectId(review.commit_id);
    if (
      !pullRequestNumber ||
      !headSha ||
      !reviewerId ||
      !occurredAt ||
      !["approved", "changes_requested", "commented", "dismissed", "pending"].includes(
        reviewState
      ) ||
      (review?.commit_id !== null && !reviewCommitSha)
    ) {
      return { success: false, error: "Pull request review webhook payload is invalid." };
    }
    return {
      success: true,
      supported: true,
      value: {
        eventName,
        action: normalizedAction,
        ...binding,
        pullRequestNumber,
        headSha,
        reviewerId,
        reviewState: reviewState as PullRequestReviewWebhook["reviewState"],
        reviewCommitSha: reviewCommitSha ?? null,
        occurredAt,
      },
    };
  }

  if (eventName === "check_run" || eventName === "check_suite") {
    const check = record(root[eventName]);
    const headSha = objectId(check?.head_sha);
    const occurredAt = date(check?.completed_at ?? check?.started_at ?? check?.updated_at);
    const pullRequestNumber = pullRequestNumberFromList(check?.pull_requests);
    const rawCheckName =
      eventName === "check_run"
        ? check?.name
        : typeof check?.app === "object"
          ? record(check.app)?.name
          : "check-suite";
    const checkName = boundedString(rawCheckName, 255);
    const checkStatus = boundedString(check?.status, 100);
    const checkConclusion = check?.conclusion == null ? null : check.conclusion;
    if (
      !check ||
      !headSha ||
      !occurredAt ||
      !checkName ||
      !checkStatus ||
      (checkConclusion !== null && !boundedString(checkConclusion, 100))
    ) {
      return { success: false, error: "Check webhook payload is invalid." };
    }
    return {
      success: true,
      supported: true,
      value: {
        eventName,
        action: normalizedAction,
        ...binding,
        pullRequestNumber,
        headSha,
        checkName,
        checkStatus,
        checkConclusion: checkConclusion as string | null,
        occurredAt,
      },
    };
  }

  const headSha = objectId(root.sha);
  const occurredAt = date(root.updated_at ?? root.created_at);
  const context = boundedString(root.context, 255);
  const statusState = boundedString(root.state, 100);
  if (!headSha || !occurredAt || !context || !statusState) {
    return { success: false, error: "Commit status webhook payload is invalid." };
  }
  return {
    success: true,
    supported: true,
    value: {
      eventName: "status",
      action: normalizedAction,
      ...binding,
      pullRequestNumber: null,
      headSha,
      context,
      statusState,
      occurredAt,
    },
  };
}

export function normalizedWebhookJson(event: NormalizedGitHubWebhook): JsonValue {
  const base: Record<string, JsonValue> = {
    eventName: event.eventName,
    action: event.action,
    installationId: event.installationId,
    repositoryGithubId: event.repositoryGithubId,
    pullRequestNumber: event.pullRequestNumber,
    headSha: event.headSha,
    occurredAt: event.occurredAt.toISOString(),
  };
  switch (event.eventName) {
    case "pull_request":
      return {
        ...base,
        headBranch: event.headBranch,
        baseBranch: event.baseBranch,
        state: event.state,
        draft: event.draft,
        merged: event.merged,
        mergeCommitSha: event.mergeCommitSha,
      };
    case "pull_request_review":
      return {
        ...base,
        reviewerId: event.reviewerId,
        reviewState: event.reviewState,
        reviewCommitSha: event.reviewCommitSha,
      };
    case "check_run":
    case "check_suite":
      return {
        ...base,
        checkName: event.checkName,
        checkStatus: event.checkStatus,
        checkConclusion: event.checkConclusion,
      };
    case "status":
      return { ...base, context: event.context, statusState: event.statusState };
  }
}
