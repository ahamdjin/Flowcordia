from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} occurrence(s), found {actual}: {old[:160]!r}")
    file.write_text(text.replace(old, new))


def write(path: str, content: str) -> None:
    file = Path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content)


write(
    "apps/webapp/app/features/flowcordia/workflows/approval/contract.ts",
    r'''import {
  FLOWCORDIA_APPROVAL_MAX_COMMENT_LENGTH,
  parseFlowcordiaApprovalResult,
  type FlowcordiaApprovalResult,
} from "@flowcordia/workflow";

export const FLOWCORDIA_APPROVAL_TAG = "flowcordia:approval" as const;
export const FLOWCORDIA_APPROVAL_INBOX_LIMIT = 50;

export type FlowcordiaApprovalDecisionValue = "approved" | "rejected";
export type FlowcordiaApprovalInboxItemState =
  | "WAITING"
  | "DECIDING"
  | "DECIDED"
  | "FAILED"
  | "TIMED_OUT";

export interface FlowcordiaApprovalIdentity {
  waitpointId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  prompt: string;
  instruction: string;
  requireComment: boolean;
  timeoutAt: string;
}

export interface FlowcordiaApprovalInboxItem extends FlowcordiaApprovalIdentity {
  state: FlowcordiaApprovalInboxItemState;
  createdAt: string;
  decision: FlowcordiaApprovalDecisionValue | null;
  comment: string | null;
  decidedAt: string | null;
  decidedByUserId: string | null;
  failureCode: string | null;
}

export interface FlowcordiaApprovalInboxProjection {
  environment: { id: string; slug: string; type: string } | null;
  waitingCount: number;
  decidingCount: number;
  items: FlowcordiaApprovalInboxItem[];
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const NODE_ID = /^[a-z][a-z0-9_-]{1,127}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseFlowcordiaApprovalRunMetadata(input: {
  metadata: string | null;
  waitpointId: string;
  runId: string;
}): FlowcordiaApprovalIdentity | null {
  if (!input.metadata) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.metadata);
  } catch {
    return null;
  }
  const root = record(parsed);
  const approval = record(root?.flowcordiaApproval);
  if (!approval || approval.schemaVersion !== "0.1" || approval.state !== "WAITING") return null;
  if (approval.waitpointId !== input.waitpointId || approval.runId !== input.runId) return null;
  if (typeof approval.workflowId !== "string" || !WORKFLOW_ID.test(approval.workflowId)) return null;
  if (typeof approval.nodeId !== "string" || !NODE_ID.test(approval.nodeId)) return null;
  if (
    typeof approval.prompt !== "string" ||
    approval.prompt.length < 1 ||
    approval.prompt.length > 500 ||
    typeof approval.instruction !== "string" ||
    approval.instruction.length > 2_000 ||
    typeof approval.requireComment !== "boolean" ||
    typeof approval.timeoutAt !== "string" ||
    !Number.isFinite(Date.parse(approval.timeoutAt))
  ) {
    return null;
  }
  return {
    waitpointId: input.waitpointId,
    workflowId: approval.workflowId,
    runId: input.runId,
    nodeId: approval.nodeId,
    prompt: approval.prompt,
    instruction: approval.instruction,
    requireComment: approval.requireComment,
    timeoutAt: new Date(approval.timeoutAt).toISOString(),
  };
}

export function parseStoredFlowcordiaApprovalResult(input: {
  status: "PENDING" | "COMPLETED";
  output: string | null;
  outputType: string | null;
  outputIsError: boolean;
}): { success: true; result: FlowcordiaApprovalResult } | { success: false; message: string } {
  if (input.status !== "COMPLETED") {
    return { success: false, message: "The approval waitpoint is not completed." };
  }
  if (input.outputIsError) {
    return { success: false, message: "The approval waitpoint completed with an error." };
  }
  if (input.outputType !== "application/json" || input.output === null) {
    return { success: false, message: "The approval waitpoint output is not inline JSON." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.output);
  } catch {
    return { success: false, message: "The approval waitpoint output is malformed JSON." };
  }
  return parseFlowcordiaApprovalResult(parsed);
}

export function normalizeFlowcordiaApprovalComment(value: string | null | undefined): string | null {
  const comment = value?.trim() ?? "";
  if (!comment) return null;
  return comment.slice(0, FLOWCORDIA_APPROVAL_MAX_COMMENT_LENGTH);
}
''',
)

write(
    "apps/webapp/app/features/flowcordia/workflows/approval/decision.ts",
    r'''import type { FlowcordiaApprovalResult } from "@flowcordia/workflow";
import {
  normalizeFlowcordiaApprovalComment,
  parseStoredFlowcordiaApprovalResult,
  type FlowcordiaApprovalDecisionValue,
  type FlowcordiaApprovalIdentity,
} from "./contract";

export type FlowcordiaApprovalDecisionStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface FlowcordiaApprovalTarget extends FlowcordiaApprovalIdentity {
  internalWaitpointId: string;
  status: "PENDING" | "COMPLETED";
  createdAt: Date;
  output: string | null;
  outputType: string | null;
  outputIsError: boolean;
}

export interface FlowcordiaApprovalDecisionReservation extends FlowcordiaApprovalIdentity {
  internalWaitpointId: string;
  requestId: string;
  status: FlowcordiaApprovalDecisionStatus;
  decision: FlowcordiaApprovalDecisionValue;
  comment: string | null;
  decidedAt: string;
  decidedByUserId: string;
}

export interface FlowcordiaApprovalDecisionCommand {
  waitpointId: string;
  expectedWorkflowId: string;
  expectedRunId: string;
  expectedNodeId: string;
  requestId: string;
  decision: FlowcordiaApprovalDecisionValue;
  comment?: string | null;
  userId: string;
}

export interface FlowcordiaApprovalDecisionDependencies {
  now(): Date;
  loadTarget(command: FlowcordiaApprovalDecisionCommand): Promise<FlowcordiaApprovalTarget | null>;
  reserve(input: {
    target: FlowcordiaApprovalTarget;
    command: FlowcordiaApprovalDecisionCommand;
    result: FlowcordiaApprovalResult;
  }): Promise<FlowcordiaApprovalDecisionReservation>;
  complete(input: {
    target: FlowcordiaApprovalTarget;
    result: FlowcordiaApprovalResult;
  }): Promise<void>;
  reload(internalWaitpointId: string): Promise<{
    status: "PENDING" | "COMPLETED";
    output: string | null;
    outputType: string | null;
    outputIsError: boolean;
  } | null>;
  markCompleted(input: {
    reservation: FlowcordiaApprovalDecisionReservation;
    observed: FlowcordiaApprovalResult;
  }): Promise<void>;
  markFailed(input: {
    reservation: FlowcordiaApprovalDecisionReservation;
    code: string;
  }): Promise<void>;
}

export type FlowcordiaApprovalDecisionErrorCode =
  | "approval_not_found"
  | "approval_identity_changed"
  | "approval_comment_required"
  | "approval_expired"
  | "approval_conflict"
  | "approval_completion_failed"
  | "approval_completion_invalid";

export class FlowcordiaApprovalDecisionError extends Error {
  constructor(
    readonly code: FlowcordiaApprovalDecisionErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly observedDecision: FlowcordiaApprovalDecisionValue | null = null
  ) {
    super(message);
    this.name = "FlowcordiaApprovalDecisionError";
  }
}

function sameResult(
  expected: Pick<FlowcordiaApprovalResult, "decision" | "comment" | "decidedAt">,
  observed: Pick<FlowcordiaApprovalResult, "decision" | "comment" | "decidedAt">
): boolean {
  return (
    expected.decision === observed.decision &&
    expected.comment === observed.comment &&
    expected.decidedAt === observed.decidedAt
  );
}

export async function decideFlowcordiaApproval(
  command: FlowcordiaApprovalDecisionCommand,
  dependencies: FlowcordiaApprovalDecisionDependencies
): Promise<{ status: "completed"; result: FlowcordiaApprovalResult; idempotent: boolean }> {
  const target = await dependencies.loadTarget(command);
  if (!target) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_not_found",
      "The approval is unavailable in this project environment.",
      404,
      false
    );
  }
  if (
    target.workflowId !== command.expectedWorkflowId ||
    target.runId !== command.expectedRunId ||
    target.nodeId !== command.expectedNodeId
  ) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_identity_changed",
      "The approval identity changed. Refresh Studio before deciding.",
      409,
      false
    );
  }
  const comment = normalizeFlowcordiaApprovalComment(command.comment);
  if (target.requireComment && comment === null) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_comment_required",
      "This approval requires a reviewer comment.",
      400,
      false
    );
  }
  if (target.status === "PENDING" && Date.parse(target.timeoutAt) <= dependencies.now().getTime()) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_expired",
      "This approval reached its reviewed timeout.",
      409,
      false
    );
  }

  const proposed: FlowcordiaApprovalResult = {
    decision: command.decision,
    comment,
    decidedAt: dependencies.now().toISOString(),
  };
  const reservation = await dependencies.reserve({ target, command, result: proposed });
  if (reservation.requestId !== command.requestId) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_conflict",
      "Another reviewer already claimed this approval.",
      409,
      false,
      reservation.status === "COMPLETED" ? reservation.decision : null
    );
  }
  const reservedResult: FlowcordiaApprovalResult = {
    decision: reservation.decision,
    comment: reservation.comment,
    decidedAt: reservation.decidedAt,
  };
  if (reservation.status === "COMPLETED") {
    return { status: "completed", result: reservedResult, idempotent: true };
  }

  try {
    if (target.status === "PENDING") {
      await dependencies.complete({ target, result: reservedResult });
    }
  } catch {
    await dependencies.markFailed({ reservation, code: "completion_failed" });
    throw new FlowcordiaApprovalDecisionError(
      "approval_completion_failed",
      "The approval could not be completed. Retry the same decision request.",
      503,
      true
    );
  }

  const authoritative = await dependencies.reload(target.internalWaitpointId);
  if (!authoritative) {
    await dependencies.markFailed({ reservation, code: "waitpoint_missing_after_completion" });
    throw new FlowcordiaApprovalDecisionError(
      "approval_completion_failed",
      "The approval completion could not be verified.",
      503,
      true
    );
  }
  const observed = parseStoredFlowcordiaApprovalResult(authoritative);
  if (!observed.success) {
    await dependencies.markFailed({ reservation, code: "invalid_authoritative_output" });
    throw new FlowcordiaApprovalDecisionError(
      "approval_completion_invalid",
      observed.message,
      409,
      false
    );
  }
  if (!sameResult(reservedResult, observed.result)) {
    await dependencies.markFailed({ reservation, code: "authoritative_decision_mismatch" });
    throw new FlowcordiaApprovalDecisionError(
      "approval_conflict",
      "The authoritative approval decision differs from this request.",
      409,
      false,
      observed.result.decision
    );
  }
  await dependencies.markCompleted({ reservation, observed: observed.result });
  return { status: "completed", result: observed.result, idempotent: false };
}
''',
)

write(
    "apps/webapp/app/features/flowcordia/workflows/approval/repository.server.ts",
    r'''import { stringifyIO, type WaitpointStatus } from "@trigger.dev/core/v3";
import type { FlowcordiaApprovalResult } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { authIncludeBase, toAuthenticated } from "~/models/runtimeEnvironment.server";
import { processWaitpointCompletionPacket } from "~/runEngine/concerns/waitpointCompletionPacket.server";
import { engine } from "~/v3/runEngine.server";
import {
  FLOWCORDIA_APPROVAL_INBOX_LIMIT,
  FLOWCORDIA_APPROVAL_TAG,
  parseFlowcordiaApprovalRunMetadata,
  type FlowcordiaApprovalDecisionValue,
  type FlowcordiaApprovalInboxItem,
  type FlowcordiaApprovalInboxProjection,
} from "./contract";
import type {
  FlowcordiaApprovalDecisionCommand,
  FlowcordiaApprovalDecisionDependencies,
  FlowcordiaApprovalDecisionReservation,
  FlowcordiaApprovalTarget,
} from "./decision";

function dbDecision(value: FlowcordiaApprovalDecisionValue): "APPROVED" | "REJECTED" {
  return value === "approved" ? "APPROVED" : "REJECTED";
}

function publicDecision(value: "APPROVED" | "REJECTED"): FlowcordiaApprovalDecisionValue {
  return value === "APPROVED" ? "approved" : "rejected";
}

export async function resolveFlowcordiaApprovalEnvironment(input: {
  organizationId: string;
  projectId: string;
  environmentSlug: string;
}) {
  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      slug: input.environmentSlug,
      archivedAt: null,
    },
    include: authIncludeBase,
  });
  return environment ? toAuthenticated(environment) : null;
}

function receiptItem(
  receipt: {
    waitpointFriendlyId: string;
    workflowId: string;
    runFriendlyId: string;
    nodeId: string;
    prompt: string;
    instruction: string;
    requireComment: boolean;
    timeoutAt: Date;
    status: "PENDING" | "COMPLETED" | "FAILED";
    decision: "APPROVED" | "REJECTED";
    comment: string | null;
    decidedAt: Date;
    decidedByUserId: string;
    failureCode: string | null;
    createdAt: Date;
  }
): FlowcordiaApprovalInboxItem {
  return {
    waitpointId: receipt.waitpointFriendlyId,
    workflowId: receipt.workflowId,
    runId: receipt.runFriendlyId,
    nodeId: receipt.nodeId,
    prompt: receipt.prompt,
    instruction: receipt.instruction,
    requireComment: receipt.requireComment,
    timeoutAt: receipt.timeoutAt.toISOString(),
    createdAt: receipt.createdAt.toISOString(),
    state:
      receipt.status === "COMPLETED"
        ? "DECIDED"
        : receipt.status === "FAILED"
          ? "FAILED"
          : "DECIDING",
    decision: publicDecision(receipt.decision),
    comment: receipt.comment,
    decidedAt: receipt.status === "COMPLETED" ? receipt.decidedAt.toISOString() : null,
    decidedByUserId: receipt.decidedByUserId,
    failureCode: receipt.failureCode,
  };
}

export async function queryFlowcordiaApprovalInbox(input: {
  organizationId: string;
  projectId: string;
  environmentSlug: string;
}): Promise<FlowcordiaApprovalInboxProjection> {
  const environment = await resolveFlowcordiaApprovalEnvironment(input);
  if (!environment) return { environment: null, waitingCount: 0, decidingCount: 0, items: [] };

  const [receipts, waitpoints] = await Promise.all([
    prisma.flowcordiaApprovalDecision.findMany({
      where: { projectId: input.projectId, runtimeEnvironmentId: environment.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: FLOWCORDIA_APPROVAL_INBOX_LIMIT,
      select: {
        waitpointId: true,
        waitpointFriendlyId: true,
        workflowId: true,
        runFriendlyId: true,
        nodeId: true,
        prompt: true,
        instruction: true,
        requireComment: true,
        timeoutAt: true,
        status: true,
        decision: true,
        comment: true,
        decidedAt: true,
        decidedByUserId: true,
        failureCode: true,
        createdAt: true,
      },
    }),
    prisma.waitpoint.findMany({
      where: {
        projectId: input.projectId,
        environmentId: environment.id,
        type: "MANUAL",
        status: "PENDING",
        tags: { has: FLOWCORDIA_APPROVAL_TAG },
        connectedRuns: { some: { taskIdentifier: { startsWith: "flowcordia-" } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: FLOWCORDIA_APPROVAL_INBOX_LIMIT,
      select: {
        id: true,
        friendlyId: true,
        completedAfter: true,
        createdAt: true,
        connectedRuns: {
          where: { taskIdentifier: { startsWith: "flowcordia-" } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { friendlyId: true, metadata: true },
        },
      },
    }),
  ]);

  const receiptWaitpointIds = new Set(receipts.map((receipt) => receipt.waitpointId));
  const waitingItems = waitpoints.flatMap((waitpoint): FlowcordiaApprovalInboxItem[] => {
    if (receiptWaitpointIds.has(waitpoint.id)) return [];
    const run = waitpoint.connectedRuns[0];
    if (!run) return [];
    const identity = parseFlowcordiaApprovalRunMetadata({
      metadata: run.metadata,
      waitpointId: waitpoint.friendlyId,
      runId: run.friendlyId,
    });
    if (!identity) return [];
    const timedOut =
      waitpoint.completedAfter !== null && waitpoint.completedAfter.getTime() <= Date.now();
    return [
      {
        ...identity,
        state: timedOut ? "TIMED_OUT" : "WAITING",
        createdAt: waitpoint.createdAt.toISOString(),
        decision: null,
        comment: null,
        decidedAt: null,
        decidedByUserId: null,
        failureCode: null,
      },
    ];
  });
  const items = [...receipts.map(receiptItem), ...waitingItems]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, FLOWCORDIA_APPROVAL_INBOX_LIMIT);
  return {
    environment: { id: environment.id, slug: environment.slug, type: environment.type },
    waitingCount: items.filter((item) => item.state === "WAITING").length,
    decidingCount: items.filter((item) => item.state === "DECIDING").length,
    items,
  };
}

export function createFlowcordiaApprovalDecisionDependencies(input: {
  organizationId: string;
  projectId: string;
  environment: NonNullable<Awaited<ReturnType<typeof resolveFlowcordiaApprovalEnvironment>>>;
}): FlowcordiaApprovalDecisionDependencies {
  return {
    now: () => new Date(),
    async loadTarget(command: FlowcordiaApprovalDecisionCommand): Promise<FlowcordiaApprovalTarget | null> {
      const waitpoint = await prisma.waitpoint.findFirst({
        where: {
          friendlyId: command.waitpointId,
          projectId: input.projectId,
          environmentId: input.environment.id,
          type: "MANUAL",
          tags: { has: FLOWCORDIA_APPROVAL_TAG },
          connectedRuns: { some: { taskIdentifier: { startsWith: "flowcordia-" } } },
        },
        select: {
          id: true,
          friendlyId: true,
          status: true,
          completedAfter: true,
          createdAt: true,
          output: true,
          outputType: true,
          outputIsError: true,
          connectedRuns: {
            where: { taskIdentifier: { startsWith: "flowcordia-" } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { friendlyId: true, metadata: true },
          },
          flowcordiaApprovalDecision: {
            select: {
              workflowId: true,
              runFriendlyId: true,
              nodeId: true,
              prompt: true,
              instruction: true,
              requireComment: true,
              timeoutAt: true,
            },
          },
        },
      });
      if (!waitpoint) return null;
      const run = waitpoint.connectedRuns[0];
      const existing = waitpoint.flowcordiaApprovalDecision;
      const identity = existing
        ? {
            waitpointId: waitpoint.friendlyId,
            workflowId: existing.workflowId,
            runId: existing.runFriendlyId,
            nodeId: existing.nodeId,
            prompt: existing.prompt,
            instruction: existing.instruction,
            requireComment: existing.requireComment,
            timeoutAt: existing.timeoutAt.toISOString(),
          }
        : run
          ? parseFlowcordiaApprovalRunMetadata({
              metadata: run.metadata,
              waitpointId: waitpoint.friendlyId,
              runId: run.friendlyId,
            })
          : null;
      if (!identity) return null;
      return {
        ...identity,
        internalWaitpointId: waitpoint.id,
        status: waitpoint.status as WaitpointStatus,
        createdAt: waitpoint.createdAt,
        output: waitpoint.output,
        outputType: waitpoint.outputType,
        outputIsError: waitpoint.outputIsError,
      };
    },
    async reserve({ target, command, result }): Promise<FlowcordiaApprovalDecisionReservation> {
      const receipt = await prisma.flowcordiaApprovalDecision.upsert({
        where: { waitpointId: target.internalWaitpointId },
        update: {},
        create: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          runtimeEnvironmentId: input.environment.id,
          waitpointId: target.internalWaitpointId,
          waitpointFriendlyId: target.waitpointId,
          workflowId: target.workflowId,
          runFriendlyId: target.runId,
          nodeId: target.nodeId,
          prompt: target.prompt,
          instruction: target.instruction,
          requireComment: target.requireComment,
          timeoutAt: new Date(target.timeoutAt),
          requestId: command.requestId,
          status: "PENDING",
          decision: dbDecision(result.decision),
          comment: result.comment,
          decidedAt: new Date(result.decidedAt),
          decidedByUserId: command.userId,
        },
      });
      return {
        internalWaitpointId: receipt.waitpointId,
        waitpointId: receipt.waitpointFriendlyId,
        workflowId: receipt.workflowId,
        runId: receipt.runFriendlyId,
        nodeId: receipt.nodeId,
        prompt: receipt.prompt,
        instruction: receipt.instruction,
        requireComment: receipt.requireComment,
        timeoutAt: receipt.timeoutAt.toISOString(),
        requestId: receipt.requestId,
        status: receipt.status,
        decision: publicDecision(receipt.decision),
        comment: receipt.comment,
        decidedAt: receipt.decidedAt.toISOString(),
        decidedByUserId: receipt.decidedByUserId,
      };
    },
    async complete({ target, result }) {
      const stringified = await stringifyIO(result);
      const packet = await processWaitpointCompletionPacket(
        stringified,
        input.environment,
        `${target.waitpointId}/flowcordia-approval`
      );
      await engine.completeWaitpoint({
        id: target.internalWaitpointId,
        output: packet.data
          ? { type: packet.dataType, value: packet.data, isError: false }
          : undefined,
      });
    },
    async reload(internalWaitpointId) {
      const waitpoint = await prisma.waitpoint.findUnique({
        where: { id: internalWaitpointId },
        select: { status: true, output: true, outputType: true, outputIsError: true },
      });
      return waitpoint
        ? {
            status: waitpoint.status,
            output: waitpoint.output,
            outputType: waitpoint.outputType,
            outputIsError: waitpoint.outputIsError,
          }
        : null;
    },
    async markCompleted({ reservation, observed }) {
      await prisma.flowcordiaApprovalDecision.update({
        where: { waitpointId: reservation.internalWaitpointId },
        data: {
          status: "COMPLETED",
          decision: dbDecision(observed.decision),
          comment: observed.comment,
          decidedAt: new Date(observed.decidedAt),
          completedAt: new Date(),
          failureCode: null,
        },
      });
    },
    async markFailed({ reservation, code }) {
      await prisma.flowcordiaApprovalDecision.update({
        where: { waitpointId: reservation.internalWaitpointId },
        data: { status: "FAILED", failureCode: code },
      });
    },
  };
}
''',
)

write(
    "apps/webapp/app/features/flowcordia/workflows/approval/commands.server.ts",
    r'''import type { RbacAbility } from "@trigger.dev/rbac";
import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../../proposals/scope.server";
import {
  FlowcordiaApprovalDecisionError,
  decideFlowcordiaApproval,
} from "./decision";
import {
  createFlowcordiaApprovalDecisionDependencies,
  resolveFlowcordiaApprovalEnvironment,
} from "./repository.server";

const ApprovalCommand = z
  .object({
    operation: z.literal("decide_approval"),
    waitpointId: z.string().regex(/^waitpoint_[A-Za-z0-9_-]{1,255}$/),
    expectedWorkflowId: z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/),
    expectedRunId: z.string().min(1).max(255),
    expectedNodeId: z.string().regex(/^[a-z][a-z0-9_-]{1,127}$/),
    requestId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    comment: z.string().max(2_000).optional(),
  })
  .strict();

export async function executeFlowcordiaApprovalCommand(input: {
  context: FlowcordiaProjectContext;
  environmentSlug: string;
  request: Request;
  userId: string;
  ability: RbacAbility;
}) {
  const declaredLength = Number(input.request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 16 * 1024) {
    return json({ ok: false, error: "request_too_large", message: "Request is too large." }, 413);
  }
  let form: FormData;
  try {
    form = await input.request.formData();
  } catch {
    return json({ ok: false, error: "invalid_request", message: "Invalid approval request." }, 400);
  }
  const parsed = ApprovalCommand.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_request", message: "Invalid approval request." }, 400);
  }
  if (!input.ability.can("write", { type: "waitpoints", id: parsed.data.waitpointId })) {
    return json({ ok: false, error: "permission_denied", message: "You cannot decide this approval." }, 403);
  }

  const { organizationId, projectId } = requireFlowcordiaProjectContext(input.context);
  const environment = await resolveFlowcordiaApprovalEnvironment({
    organizationId,
    projectId,
    environmentSlug: input.environmentSlug,
  });
  if (!environment) {
    return json({ ok: false, error: "environment_not_found", message: "Environment not found." }, 404);
  }
  try {
    const result = await decideFlowcordiaApproval(
      {
        waitpointId: parsed.data.waitpointId,
        expectedWorkflowId: parsed.data.expectedWorkflowId,
        expectedRunId: parsed.data.expectedRunId,
        expectedNodeId: parsed.data.expectedNodeId,
        requestId: parsed.data.requestId,
        decision: parsed.data.decision,
        comment: parsed.data.comment,
        userId: input.userId,
      },
      createFlowcordiaApprovalDecisionDependencies({
        organizationId,
        projectId,
        environment,
      })
    );
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof FlowcordiaApprovalDecisionError) {
      return json(
        {
          ok: false,
          error: error.code,
          message: error.message,
          retryable: error.retryable,
          observedDecision: error.observedDecision,
        },
        error.status
      );
    }
    return json(
      {
        ok: false,
        error: "approval_completion_failed",
        message: "The approval could not be completed.",
        retryable: true,
      },
      503
    );
  }
}
''',
)

write(
    "apps/webapp/app/features/flowcordia/workflows/approval/WorkflowApprovalInboxPanel.tsx",
    r'''import { useFetcher } from "@remix-run/react";
import { useState } from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button } from "~/components/primitives/Buttons";
import type {
  FlowcordiaApprovalInboxItem,
  FlowcordiaApprovalInboxProjection,
} from "./contract";

type CommandResponse =
  | { ok: true; status: "completed"; idempotent: boolean }
  | {
      ok: false;
      error: string;
      message: string;
      retryable?: boolean;
      observedDecision?: "approved" | "rejected" | null;
    };

function timestamp(value: string): string {
  return `${value.replace("T", " ").slice(0, 16)} UTC`;
}

function stateLabel(item: FlowcordiaApprovalInboxItem): string {
  switch (item.state) {
    case "WAITING":
      return "Waiting";
    case "DECIDING":
      return "Completing";
    case "DECIDED":
      return item.decision === "approved" ? "Approved" : "Rejected";
    case "FAILED":
      return "Needs retry";
    case "TIMED_OUT":
      return "Timed out";
  }
}

function ApprovalCard({
  item,
  commandPath,
  canDecide,
}: {
  item: FlowcordiaApprovalInboxItem;
  commandPath: string;
  canDecide: boolean;
}) {
  const fetcher = useFetcher<CommandResponse>();
  const [comment, setComment] = useState("");
  const busy = fetcher.state !== "idle";
  const canSubmit =
    item.state === "WAITING" &&
    canDecide &&
    !busy &&
    (!item.requireComment || comment.trim().length > 0);
  const submit = (decision: "approved" | "rejected") => {
    const data = new FormData();
    data.set("operation", "decide_approval");
    data.set("waitpointId", item.waitpointId);
    data.set("expectedWorkflowId", item.workflowId);
    data.set("expectedRunId", item.runId);
    data.set("expectedNodeId", item.nodeId);
    data.set("requestId", crypto.randomUUID());
    data.set("decision", decision);
    data.set("comment", comment);
    fetcher.submit(data, { method: "post", action: commandPath });
  };

  return (
    <article
      data-testid={`flowcordia-approval-${item.waitpointId}`}
      data-state={item.state}
      className="rounded border border-grid-bright bg-background-bright p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-xs font-medium text-text-bright">{item.prompt}</h4>
          <div className="mt-1 text-xxs text-text-dimmed">
            {item.workflowId} · {item.nodeId} · {item.runId}
          </div>
        </div>
        <Badge className="shrink-0 border border-grid-bright bg-background-dimmed text-text-dimmed">
          {stateLabel(item)}
        </Badge>
      </div>
      {item.instruction && (
        <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-text-dimmed">
          {item.instruction}
        </p>
      )}
      <div className="mt-3 text-xxs text-text-dimmed">
        Created {timestamp(item.createdAt)} · timeout {timestamp(item.timeoutAt)}
      </div>

      {item.state === "WAITING" && (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">
              Reviewer comment {item.requireComment ? "(required)" : "(optional)"}
            </span>
            <textarea
              className="w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400"
              value={comment}
              disabled={!canDecide || busy}
              rows={3}
              maxLength={2_000}
              placeholder="Record the reason for this decision."
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="primary/small"
              disabled={!canSubmit}
              onClick={() => submit("approved")}
            >
              Approve
            </Button>
            <Button
              variant="secondary/small"
              disabled={!canSubmit}
              onClick={() => submit("rejected")}
            >
              Reject
            </Button>
          </div>
          {!canDecide && (
            <div className="text-xxs text-text-dimmed">
              Your current role cannot complete waitpoints in this environment.
            </div>
          )}
          {fetcher.data && !fetcher.data.ok && (
            <div className="rounded border border-rose-500/25 bg-rose-500/10 px-2.5 py-2 text-xxs text-rose-200">
              {fetcher.data.message}
            </div>
          )}
        </div>
      )}

      {item.decision && item.state !== "WAITING" && (
        <div className="mt-3 rounded border border-grid-dimmed bg-background-dimmed px-2.5 py-2 text-xs text-text-dimmed">
          <div>
            {item.decision === "approved" ? "Approved" : "Rejected"}
            {item.decidedAt ? ` at ${timestamp(item.decidedAt)}` : ""}
          </div>
          {item.comment && <div className="mt-1 whitespace-pre-wrap">{item.comment}</div>}
        </div>
      )}
    </article>
  );
}

export function WorkflowApprovalInboxPanel({
  inbox,
  commandPath,
  canDecide,
}: {
  inbox: FlowcordiaApprovalInboxProjection;
  commandPath: string;
  canDecide: boolean;
}) {
  return (
    <section
      data-testid="flowcordia-approval-inbox"
      data-waiting-count={inbox.waitingCount}
      className="border-b border-grid-bright bg-background-dimmed px-4 py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-bright">Approval inbox</h3>
          <p className="mt-1 text-xs leading-5 text-text-dimmed">
            Durable human decisions for this exact project environment. Tokens and callback URLs never
            enter the browser.
          </p>
        </div>
        <Badge className="border border-grid-bright bg-background-bright text-text-dimmed">
          {inbox.waitingCount} waiting
        </Badge>
      </div>
      {!inbox.environment ? (
        <div className="mt-3 rounded border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          This environment is unavailable, so approvals cannot be listed.
        </div>
      ) : inbox.items.length === 0 ? (
        <div className="mt-3 rounded border border-grid-dimmed bg-background-bright px-3 py-3 text-xs text-text-dimmed">
          No Flowcordia approvals have been created in this environment.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {inbox.items.map((item) => (
            <ApprovalCard
              key={`${item.waitpointId}:${item.state}`}
              item={item}
              commandPath={commandPath}
              canDecide={canDecide}
            />
          ))}
        </div>
      )}
    </section>
  );
}
''',
)

write(
    "apps/webapp/app/routes/resources.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflow-approvals/route.ts",
    r'''import { executeFlowcordiaApprovalCommand } from "~/features/flowcordia/workflows/approval/commands.server";
import {
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { dashboardAction } from "~/services/routeBuilders/dashboardBuilder";
import { EnvironmentParamSchema } from "~/utils/pathBuilder";

export const action = dashboardAction(
  {
    params: EnvironmentParamSchema,
    context: resolveFlowcordiaProjectContext,
    authorization: { action: "write", resource: { type: "github" } },
  },
  async ({ context, params, request, user, ability }) => {
    const enabled = await canAccessFlowcordiaStudio({
      userId: user.id,
      isAdmin: user.admin,
      isImpersonating: user.isImpersonating,
      organizationSlug: params.organizationSlug,
    });
    if (!enabled) throw new Response("Not found", { status: 404 });
    return executeFlowcordiaApprovalCommand({
      context,
      environmentSlug: params.envParam,
      request,
      userId: user.id,
      ability,
    });
  }
);
''',
)

write(
    "apps/webapp/test/flowcordia/approvalDecision.test.ts",
    r'''import { describe, expect, it, vi } from "vitest";
import type { FlowcordiaApprovalResult } from "@flowcordia/workflow";
import {
  FlowcordiaApprovalDecisionError,
  decideFlowcordiaApproval,
  type FlowcordiaApprovalDecisionDependencies,
  type FlowcordiaApprovalDecisionReservation,
  type FlowcordiaApprovalTarget,
} from "~/features/flowcordia/workflows/approval/decision";

const now = new Date("2026-07-24T21:00:00.000Z");

function target(overrides: Partial<FlowcordiaApprovalTarget> = {}): FlowcordiaApprovalTarget {
  return {
    internalWaitpointId: "wp_internal",
    waitpointId: "waitpoint_public",
    workflowId: "approval-workflow",
    runId: "run_123",
    nodeId: "approval",
    prompt: "Approve this order?",
    instruction: "Check the amount.",
    requireComment: false,
    timeoutAt: "2026-07-25T21:00:00.000Z",
    status: "PENDING",
    createdAt: now,
    output: null,
    outputType: "application/json",
    outputIsError: false,
    ...overrides,
  };
}

function dependencies(overrides: Partial<FlowcordiaApprovalDecisionDependencies> = {}) {
  let observed: FlowcordiaApprovalResult = {
    decision: "approved",
    comment: null,
    decidedAt: now.toISOString(),
  };
  const reservation: FlowcordiaApprovalDecisionReservation = {
    ...target(),
    requestId: "00000000-0000-4000-8000-000000000001",
    status: "PENDING",
    decision: "approved",
    comment: null,
    decidedAt: now.toISOString(),
    decidedByUserId: "user_1",
  };
  const result: FlowcordiaApprovalDecisionDependencies = {
    now: () => now,
    loadTarget: vi.fn(async () => target()),
    reserve: vi.fn(async () => reservation),
    complete: vi.fn(async ({ result }) => {
      observed = result;
    }),
    reload: vi.fn(async () => ({
      status: "COMPLETED",
      output: JSON.stringify(observed),
      outputType: "application/json",
      outputIsError: false,
    })),
    markCompleted: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    ...overrides,
  };
  return result;
}

const command = {
  waitpointId: "waitpoint_public",
  expectedWorkflowId: "approval-workflow",
  expectedRunId: "run_123",
  expectedNodeId: "approval",
  requestId: "00000000-0000-4000-8000-000000000001",
  decision: "approved" as const,
  comment: null,
  userId: "user_1",
};

describe("Flowcordia approval decision fencing", () => {
  it("completes and verifies the exact reserved decision", async () => {
    const deps = dependencies();
    const result = await decideFlowcordiaApproval(command, deps);
    expect(result).toMatchObject({ status: "completed", idempotent: false });
    expect(deps.complete).toHaveBeenCalledOnce();
    expect(deps.markCompleted).toHaveBeenCalledOnce();
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("requires a bounded comment when the workflow contract requires one", async () => {
    const deps = dependencies({ loadTarget: vi.fn(async () => target({ requireComment: true })) });
    await expect(decideFlowcordiaApproval(command, deps)).rejects.toMatchObject({
      code: "approval_comment_required",
      status: 400,
    });
    expect(deps.reserve).not.toHaveBeenCalled();
  });

  it("rejects a competing request before completing the waitpoint", async () => {
    const deps = dependencies({
      reserve: vi.fn(async () => ({
        ...target(),
        requestId: "00000000-0000-4000-8000-000000000099",
        status: "PENDING",
        decision: "rejected",
        comment: "Another reviewer claimed this.",
        decidedAt: now.toISOString(),
        decidedByUserId: "user_2",
      })),
    });
    await expect(decideFlowcordiaApproval(command, deps)).rejects.toMatchObject({
      code: "approval_conflict",
      status: 409,
    });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("recovers the same request after the waitpoint completed but before the receipt finalized", async () => {
    const deps = dependencies({ loadTarget: vi.fn(async () => target({ status: "COMPLETED" })) });
    const result = await decideFlowcordiaApproval(command, deps);
    expect(result.idempotent).toBe(false);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.markCompleted).toHaveBeenCalledOnce();
  });

  it("fails closed when authoritative output differs from the reservation", async () => {
    const deps = dependencies({
      reload: vi.fn(async () => ({
        status: "COMPLETED",
        output: JSON.stringify({
          decision: "rejected",
          comment: null,
          decidedAt: now.toISOString(),
        }),
        outputType: "application/json",
        outputIsError: false,
      })),
    });
    await expect(decideFlowcordiaApproval(command, deps)).rejects.toBeInstanceOf(
      FlowcordiaApprovalDecisionError
    );
    expect(deps.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ code: "authoritative_decision_mismatch" })
    );
  });
});
''',
)

write(
    "apps/webapp/test/flowcordia/approvalInboxPresentation.test.ts",
    r'''import { describe, expect, it } from "vitest";
import {
  normalizeFlowcordiaApprovalComment,
  parseFlowcordiaApprovalRunMetadata,
  parseStoredFlowcordiaApprovalResult,
} from "~/features/flowcordia/workflows/approval/contract";

describe("Flowcordia approval inbox contracts", () => {
  it("accepts only the exact current approval identity", () => {
    const metadata = JSON.stringify({
      flowcordiaApproval: {
        schemaVersion: "0.1",
        state: "WAITING",
        waitpointId: "waitpoint_public",
        workflowId: "approval-workflow",
        runId: "run_123",
        nodeId: "approval",
        prompt: "Approve this order?",
        instruction: "Check the amount.",
        requireComment: true,
        timeoutAt: "2026-07-25T21:00:00.000Z",
      },
    });
    expect(
      parseFlowcordiaApprovalRunMetadata({
        metadata,
        waitpointId: "waitpoint_public",
        runId: "run_123",
      })
    ).toMatchObject({ workflowId: "approval-workflow", requireComment: true });
    expect(
      parseFlowcordiaApprovalRunMetadata({
        metadata,
        waitpointId: "waitpoint_other",
        runId: "run_123",
      })
    ).toBeNull();
  });

  it("rejects callback or token fields hidden inside run metadata", () => {
    const metadata = JSON.stringify({
      flowcordiaApproval: {
        schemaVersion: "0.1",
        state: "WAITING",
        waitpointId: "waitpoint_public",
        workflowId: "approval-workflow",
        runId: "run_123",
        nodeId: "approval",
        prompt: "Approve?",
        instruction: "",
        requireComment: false,
        timeoutAt: "2026-07-25T21:00:00.000Z",
        publicAccessToken: "secret",
      },
    });
    expect(
      parseFlowcordiaApprovalRunMetadata({
        metadata,
        waitpointId: "waitpoint_public",
        runId: "run_123",
      })
    ).toBeNull();
  });

  it("parses only strict inline JSON completion output", () => {
    expect(
      parseStoredFlowcordiaApprovalResult({
        status: "COMPLETED",
        output: JSON.stringify({
          decision: "approved",
          comment: null,
          decidedAt: "2026-07-24T21:00:00.000Z",
        }),
        outputType: "application/json",
        outputIsError: false,
      })
    ).toMatchObject({ success: true });
    expect(
      parseStoredFlowcordiaApprovalResult({
        status: "COMPLETED",
        output: "{}",
        outputType: "application/store",
        outputIsError: false,
      }).success
    ).toBe(false);
  });

  it("normalizes blank comments without inventing audit text", () => {
    expect(normalizeFlowcordiaApprovalComment("   ")).toBeNull();
    expect(normalizeFlowcordiaApprovalComment("  checked  ")).toBe("checked");
  });
});
''',
)

write(
    "internal-packages/database/prisma/migrations/20260724220000_flowcordia_human_approval_decisions/migration.sql",
    r'''CREATE TYPE "FlowcordiaApprovalDecisionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "FlowcordiaApprovalDecisionValue" AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE "FlowcordiaApprovalDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runtimeEnvironmentId" TEXT NOT NULL,
    "waitpointId" TEXT NOT NULL,
    "waitpointFriendlyId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "runFriendlyId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "requireComment" BOOLEAN NOT NULL,
    "timeoutAt" TIMESTAMP(3) NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "FlowcordiaApprovalDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "decision" "FlowcordiaApprovalDecisionValue" NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "decidedByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaApprovalDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowcordiaApprovalDecision_waitpointId_key"
ON "FlowcordiaApprovalDecision"("waitpointId");
CREATE INDEX "FlowcordiaApprovalDecision_env_created_idx"
ON "FlowcordiaApprovalDecision"("projectId", "runtimeEnvironmentId", "createdAt" DESC);
CREATE INDEX "FlowcordiaApprovalDecision_request_idx"
ON "FlowcordiaApprovalDecision"("runtimeEnvironmentId", "requestId");

ALTER TABLE "FlowcordiaApprovalDecision"
ADD CONSTRAINT "FlowcordiaApprovalDecision_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowcordiaApprovalDecision"
ADD CONSTRAINT "FlowcordiaApprovalDecision_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowcordiaApprovalDecision"
ADD CONSTRAINT "FlowcordiaApprovalDecision_runtimeEnvironmentId_fkey"
FOREIGN KEY ("runtimeEnvironmentId") REFERENCES "RuntimeEnvironment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowcordiaApprovalDecision"
ADD CONSTRAINT "FlowcordiaApprovalDecision_waitpointId_fkey"
FOREIGN KEY ("waitpointId") REFERENCES "Waitpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
''',
)

schema_path = "internal-packages/database/prisma/schema.prisma"
replace(
    schema_path,
    "  flowcordiaPublicWebhookDeliveries FlowcordiaPublicWebhookDelivery[]\n  customerQueries",
    "  flowcordiaPublicWebhookDeliveries FlowcordiaPublicWebhookDelivery[]\n  flowcordiaApprovalDecisions        FlowcordiaApprovalDecision[]\n  customerQueries",
    count=1,
)
replace(
    schema_path,
    "  flowcordiaPublicWebhookDeliveries FlowcordiaPublicWebhookDelivery[]\n\n  sessions",
    "  flowcordiaPublicWebhookDeliveries FlowcordiaPublicWebhookDelivery[]\n  flowcordiaApprovalDecisions        FlowcordiaApprovalDecision[]\n\n  sessions",
    count=1,
)
replace(
    schema_path,
    "  flowcordiaPublicWebhookDeliveries FlowcordiaPublicWebhookDelivery[]\n  organizationProjectIntegration",
    "  flowcordiaPublicWebhookDeliveries FlowcordiaPublicWebhookDelivery[]\n  flowcordiaApprovalDecisions        FlowcordiaApprovalDecision[]\n  organizationProjectIntegration",
    count=1,
)
replace(
    schema_path,
    "  connectedRuns TaskRun[] @relation(\"WaitpointRunConnections\")\n",
    "  connectedRuns TaskRun[] @relation(\"WaitpointRunConnections\")\n  flowcordiaApprovalDecision FlowcordiaApprovalDecision?\n",
    count=1,
)
replace(
    schema_path,
    'enum FlowcordiaPublicWebhookDeliveryStatus {\n',
    r'''enum FlowcordiaApprovalDecisionStatus {
  PENDING
  COMPLETED
  FAILED
}

enum FlowcordiaApprovalDecisionValue {
  APPROVED
  REJECTED
}

model FlowcordiaApprovalDecision {
  id String @id @default(cuid())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  organizationId String

  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  projectId String

  runtimeEnvironment   RuntimeEnvironment @relation(fields: [runtimeEnvironmentId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  runtimeEnvironmentId String

  waitpoint   Waitpoint @relation(fields: [waitpointId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  waitpointId String    @unique

  waitpointFriendlyId String
  workflowId          String
  runFriendlyId       String
  nodeId               String
  prompt               String
  instruction          String
  requireComment       Boolean
  timeoutAt            DateTime

  requestId       String
  status          FlowcordiaApprovalDecisionStatus @default(PENDING)
  decision        FlowcordiaApprovalDecisionValue
  comment         String?
  decidedAt       DateTime
  decidedByUserId String
  completedAt     DateTime?
  failureCode     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId, runtimeEnvironmentId, createdAt(sort: Desc)], map: "FlowcordiaApprovalDecision_env_created_idx")
  @@index([runtimeEnvironmentId, requestId], map: "FlowcordiaApprovalDecision_request_idx")
}

enum FlowcordiaPublicWebhookDeliveryStatus {
''',
    count=1,
)

studio_route = "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
replace(
    studio_route,
    'import { FlowcordiaStudioOnboarding } from "~/features/flowcordia/workflows/onboarding/FlowcordiaStudioOnboarding";\n',
    'import { WorkflowApprovalInboxPanel } from "~/features/flowcordia/workflows/approval/WorkflowApprovalInboxPanel";\nimport { queryFlowcordiaApprovalInbox } from "~/features/flowcordia/workflows/approval/repository.server";\nimport { FlowcordiaStudioOnboarding } from "~/features/flowcordia/workflows/onboarding/FlowcordiaStudioOnboarding";\n',
)
replace(
    studio_route,
    '''      const credentialWorkspace = await queryFlowcordiaCredentialWorkspace({
        projectId,
        environmentSlug: params.envParam,
        graph: workspace.graph,
        canRead: canReadCredentials,
      });
      const canTriggerPreview''',
    '''      const credentialWorkspace = await queryFlowcordiaCredentialWorkspace({
        projectId,
        environmentSlug: params.envParam,
        graph: workspace.graph,
        canRead: canReadCredentials,
      });
      const approvalInbox = await queryFlowcordiaApprovalInbox({
        organizationId,
        projectId,
        environmentSlug: params.envParam,
      });
      const canTriggerPreview''',
)
replace(
    studio_route,
    '''        credentialWorkspace,
        canManageCredentials,
        canWrite,''',
    '''        credentialWorkspace,
        approvalInbox,
        canDecideApprovals: canWrite,
        canManageCredentials,
        canWrite,''',
    count=1,
)
replace(
    studio_route,
    '''          credentialWorkspace: { environment: null, bindings: [] },
          canManageCredentials: false,''',
    '''          credentialWorkspace: { environment: null, bindings: [] },
          approvalInbox: { environment: null, waitingCount: 0, decidingCount: 0, items: [] },
          canDecideApprovals: false,
          canManageCredentials: false,''',
)
replace(
    studio_route,
    '''  const credentialCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/env/${environment.slug}/flowcordia/workflow-credentials`;
  const installPath''',
    '''  const credentialCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/env/${environment.slug}/flowcordia/workflow-credentials`;
  const approvalCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/env/${environment.slug}/flowcordia/workflow-approvals`;
  const installPath''',
)
replace(
    studio_route,
    '''                <div hidden={selectedLifecycleStep !== "production"}>
                  <FlowcordiaOperationsHealthPanel''',
    '''                <div hidden={selectedLifecycleStep !== "production"}>
                  <WorkflowApprovalInboxPanel
                    inbox={data.approvalInbox}
                    commandPath={approvalCommandPath}
                    canDecide={data.canDecideApprovals}
                  />
                  <FlowcordiaOperationsHealthPanel''',
)

replace(
    "flowcordia/architecture/durable-human-approvals.md",
    "An authenticated server command re-resolves organization, project, environment, waitpoint, connected run, RBAC, and pending state. It completes the existing Trigger.dev waitpoint through the server-owned environment API key, then records one unique Flowcordia decision receipt containing actor, decision, bounded comment, and timestamp.",
    "An authenticated server command re-resolves organization, project, environment, waitpoint, connected run, RBAC, and pending state. It reserves one unique decision claim, completes the existing Trigger.dev waitpoint through the inherited server-side packet and run-engine path, re-reads the authoritative output, and finalizes the actor, decision, bounded comment, and timestamp receipt.",
)
replace(
    "flowcordia/product/capability-matrix.md",
    "| Human approval | Approval node and approval inbox | Planned |",
    "| Human approval | Approval node and project-environment inbox | Strict bounded configuration, deterministic preview, per-run/node idempotent MANUAL waitpoint, checkpointed live execution, server-only completion, exact run/waitpoint identity, comment policy, unique decision fencing, authoritative output verification, retry recovery, actor receipt, and Studio approve/reject controls delivered; notifications, public links, delegation, quorum, escalation, and cross-project inbox remain planned |",
)
replace(
    "flowcordia/product/roadmap.md",
    "- Support subflows, batching, parallelism, approvals, and streaming. — typed version-locked child invocation, bounded same-child batch fan-out, exact-index child selection, missing/invalid target checks, repository-wide cycle prevention, exact trigger/output callable contract binding, immutable root-to-leaf proposal closure, durable closure identity, exact preview-worker installation proof, exact production-worker closure activation proof, and closure-aware protected production evidence delivered; approvals, streaming batches, and mixed-child parallelism remain",
    "- Support subflows, batching, parallelism, approvals, and streaming. — typed version-locked child invocation, bounded same-child batch fan-out, exact-index child selection, missing/invalid target checks, repository-wide cycle prevention, exact trigger/output callable contract binding, immutable root-to-leaf proposal closure, durable closure identity, exact preview-worker installation proof, exact production-worker closure activation proof, closure-aware protected production evidence, and one durable single-reviewer approval node with a project-environment inbox delivered; notifications, delegation, quorum, escalation, streaming batches, and mixed-child parallelism remain",
)
