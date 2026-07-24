import { stringifyIO } from "@trigger.dev/core/v3";
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

function receiptItem(receipt: {
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
}): FlowcordiaApprovalInboxItem {
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
    async loadTarget(
      command: FlowcordiaApprovalDecisionCommand
    ): Promise<FlowcordiaApprovalTarget | null> {
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
        status: waitpoint.status,
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
