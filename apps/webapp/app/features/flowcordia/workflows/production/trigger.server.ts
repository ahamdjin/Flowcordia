import type { ControlPlaneScope } from "@flowcordia/control-plane";
import type { JsonValue } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { authIncludeBase, toAuthenticated } from "~/models/runtimeEnvironment.server";
import { TriggerTaskService } from "~/v3/services/triggerTask.server";
import {
  flowcordiaProductionRunIdempotencyKey,
  flowcordiaProductionRunSeedMetadata,
} from "./identity";
import { findLatestMergedFlowcordiaProposal } from "./repository.server";

export type FlowcordiaProductionRunErrorCode =
  | "production_not_ready"
  | "promotion_conflict"
  | "task_not_deployed"
  | "trigger_failed";

export class FlowcordiaProductionRunError extends Error {
  constructor(
    readonly code: FlowcordiaProductionRunErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaProductionRunError";
  }
}

export async function triggerFlowcordiaProductionRun(input: {
  scope: ControlPlaneScope;
  workflowId: string;
  expectedProposalId: string;
  expectedMergeCommitSha: string;
  requestId: string;
  payload: JsonValue;
}) {
  const latestMerged = await findLatestMergedFlowcordiaProposal({
    scope: input.scope,
    workflowId: input.workflowId,
  });
  if (
    !latestMerged ||
    latestMerged.proposalId !== input.expectedProposalId ||
    latestMerged.mergeCommitSha !== input.expectedMergeCommitSha
  ) {
    throw new FlowcordiaProductionRunError(
      "promotion_conflict",
      "The latest promoted workflow identity changed. Refresh Studio before starting production proof.",
      409,
      false
    );
  }

  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      organizationId: input.scope.tenantId,
      projectId: input.scope.projectId,
      type: "PRODUCTION",
      archivedAt: null,
    },
    include: authIncludeBase,
  });
  if (!environment) {
    throw new FlowcordiaProductionRunError(
      "production_not_ready",
      "The production environment is unavailable.",
      409,
      true
    );
  }

  const deployment = await prisma.workerDeployment.findFirst({
    where: {
      projectId: input.scope.projectId,
      environmentId: environment.id,
    },
    orderBy: { createdAt: "desc" },
    select: { version: true, status: true, workerId: true, commitSHA: true },
  });
  if (
    !deployment ||
    deployment.status !== "DEPLOYED" ||
    !deployment.workerId ||
    deployment.commitSHA !== input.expectedMergeCommitSha
  ) {
    throw new FlowcordiaProductionRunError(
      "production_not_ready",
      "The latest production deployment is not a deployed worker for the exact promoted commit.",
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
    throw new FlowcordiaProductionRunError(
      "task_not_deployed",
      "The production deployment did not discover the generated Flowcordia task.",
      409,
      false
    );
  }

  try {
    const identity = {
      workflowId: input.workflowId,
      proposalId: latestMerged.proposalId,
      mergeCommitSha: input.expectedMergeCommitSha,
    };
    const idempotencyKey = flowcordiaProductionRunIdempotencyKey(identity, input.requestId);
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
            flowcordiaProduction: flowcordiaProductionRunSeedMetadata(identity),
          },
        },
      },
      {
        idempotencyKey,
        idempotencyKeyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        triggerSource: "dashboard",
        triggerAction: "flowcordia_production_proof",
      }
    );
    if (!result) {
      throw new FlowcordiaProductionRunError(
        "task_not_deployed",
        "The generated Flowcordia task is unavailable in the production deployment.",
        409,
        true
      );
    }
    return { friendlyId: result.run.friendlyId, cached: result.isCached };
  } catch (error) {
    if (error instanceof FlowcordiaProductionRunError) throw error;
    throw new FlowcordiaProductionRunError(
      "trigger_failed",
      "The production proof run could not be started.",
      503,
      true
    );
  }
}
