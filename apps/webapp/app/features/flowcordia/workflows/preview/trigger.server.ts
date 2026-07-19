import type { ControlPlaneScope } from "@flowcordia/control-plane";
import type { JsonValue } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { authIncludeBase, toAuthenticated } from "~/models/runtimeEnvironment.server";
import { TriggerTaskService } from "~/v3/services/triggerTask.server";
import { flowcordiaProposalStore } from "../../proposals/prisma.server";
import { flowcordiaPreviewRunIdempotencyKey, flowcordiaPreviewRunSeedMetadata } from "./identity";

export type FlowcordiaPreviewRunErrorCode =
  | "preview_not_ready"
  | "proposal_conflict"
  | "task_not_deployed"
  | "trigger_failed";

export class FlowcordiaPreviewRunError extends Error {
  constructor(
    readonly code: FlowcordiaPreviewRunErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaPreviewRunError";
  }
}

export async function triggerFlowcordiaPreviewRun(input: {
  scope: ControlPlaneScope;
  workflowId: string;
  expectedHeadSha: string;
  requestId: string;
  payload: JsonValue;
}) {
  const proposals = await flowcordiaProposalStore.listProposals({
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    repositoryId: input.scope.repositoryId,
    limit: 100,
  });
  const proposal = proposals.find(
    (candidate) =>
      candidate.workflowId === input.workflowId &&
      candidate.headSha === input.expectedHeadSha &&
      !["MERGED", "CLOSED", "FAILED"].includes(candidate.state)
  );
  if (!proposal) {
    throw new FlowcordiaPreviewRunError(
      "proposal_conflict",
      "The proposal head changed. Refresh Studio before starting a live preview run.",
      409,
      false
    );
  }

  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      organizationId: input.scope.tenantId,
      projectId: input.scope.projectId,
      type: "PREVIEW",
      parentEnvironmentId: { not: null },
      branchName: proposal.proposalBranch,
      archivedAt: null,
    },
    include: authIncludeBase,
  });
  if (!environment) {
    throw new FlowcordiaPreviewRunError(
      "preview_not_ready",
      "The proposal preview environment is not ready yet.",
      409,
      true
    );
  }

  const deployment = await prisma.workerDeployment.findFirst({
    where: {
      projectId: input.scope.projectId,
      environmentId: environment.id,
      commitSHA: input.expectedHeadSha,
      status: "DEPLOYED",
      workerId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { version: true, workerId: true },
  });
  if (!deployment?.workerId) {
    throw new FlowcordiaPreviewRunError(
      "preview_not_ready",
      "The exact proposal head has not finished deploying.",
      409,
      true
    );
  }

  const taskIdentifier = `flowcordia-${input.workflowId}`;
  const task = await prisma.backgroundWorkerTask.findFirst({
    where: {
      projectId: input.scope.projectId,
      runtimeEnvironmentId: environment.id,
      workerId: deployment.workerId,
      slug: taskIdentifier,
    },
    select: { id: true },
  });
  if (!task) {
    throw new FlowcordiaPreviewRunError(
      "task_not_deployed",
      "The preview deployment did not discover the generated Flowcordia task.",
      409,
      false
    );
  }

  try {
    const runIdentity = {
      workflowId: input.workflowId,
      proposalId: proposal.proposalId,
      headSha: input.expectedHeadSha,
    };
    const idempotencyKey = flowcordiaPreviewRunIdempotencyKey(runIdentity, input.requestId);
    const result = await new TriggerTaskService().call(
      taskIdentifier,
      toAuthenticated(environment),
      {
        payload: JSON.stringify(input.payload),
        options: {
          payloadType: "application/json",
          lockToVersion: deployment.version,
          idempotencyKey,
          idempotencyKeyTTL: "10m",
          metadata: {
            flowcordiaTrigger: flowcordiaPreviewRunSeedMetadata(runIdentity),
          },
        },
      },
      {
        idempotencyKey,
        idempotencyKeyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        triggerSource: "dashboard",
        triggerAction: "flowcordia_preview",
      }
    );
    if (!result) {
      throw new FlowcordiaPreviewRunError(
        "task_not_deployed",
        "The generated Flowcordia task is unavailable in this deployment.",
        409,
        true
      );
    }
    return { friendlyId: result.run.friendlyId, cached: result.isCached };
  } catch (error) {
    if (error instanceof FlowcordiaPreviewRunError) throw error;
    throw new FlowcordiaPreviewRunError(
      "trigger_failed",
      "The live preview run could not be started.",
      503,
      true
    );
  }
}
