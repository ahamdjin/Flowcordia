import type { WorkflowIndexScope } from "../index/types";
import { prisma } from "~/db.server";
import { authIncludeBase, toAuthenticated } from "~/models/runtimeEnvironment.server";
import { TriggerTaskService } from "~/v3/services/triggerTask.server";
import { flowcordiaProposalStore } from "../../proposals/prisma.server";
import {
  buildFlowcordiaFunctionValidationPlan,
  FlowcordiaFunctionValidationSuiteError,
} from "./suite.server";

export type FlowcordiaFunctionValidationTriggerErrorCode =
  | "proposal_conflict"
  | "validation_not_required"
  | "validation_blocked"
  | "preview_not_ready"
  | "task_not_deployed"
  | "trigger_failed";

export class FlowcordiaFunctionValidationTriggerError extends Error {
  constructor(
    readonly code: FlowcordiaFunctionValidationTriggerErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaFunctionValidationTriggerError";
  }
}

function suiteError(error: FlowcordiaFunctionValidationSuiteError) {
  if (error.code === "proposal_conflict") {
    return new FlowcordiaFunctionValidationTriggerError(
      "proposal_conflict",
      error.message,
      409,
      false
    );
  }
  return new FlowcordiaFunctionValidationTriggerError(
    "validation_blocked",
    error.message,
    error.retryable ? 503 : 409,
    error.retryable
  );
}

export async function triggerFlowcordiaFunctionValidation(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
  expectedHeadSha: string;
  requestId: string;
}) {
  let plan: Awaited<ReturnType<typeof buildFlowcordiaFunctionValidationPlan>>;
  try {
    plan = await buildFlowcordiaFunctionValidationPlan(input);
  } catch (error) {
    if (error instanceof FlowcordiaFunctionValidationSuiteError) throw suiteError(error);
    throw error;
  }
  if (!plan.required) {
    throw new FlowcordiaFunctionValidationTriggerError(
      "validation_not_required",
      "This workflow does not contain repository-owned typed functions.",
      409,
      false
    );
  }

  const proposals = await flowcordiaProposalStore.listProposals({
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    repositoryId: input.scope.repositoryId,
    limit: 100,
  });
  const proposal = proposals.find(
    (candidate) =>
      candidate.proposalId === plan.proposalId &&
      candidate.workflowId === input.workflowId &&
      candidate.headSha === plan.headSha &&
      !["MERGED", "CLOSED", "FAILED"].includes(candidate.state)
  );
  if (!proposal) {
    throw new FlowcordiaFunctionValidationTriggerError(
      "proposal_conflict",
      "The proposal changed before validation could start.",
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
    throw new FlowcordiaFunctionValidationTriggerError(
      "preview_not_ready",
      "The exact proposal preview environment is not ready yet.",
      409,
      true
    );
  }

  const deployment = await prisma.workerDeployment.findFirst({
    where: {
      projectId: input.scope.projectId,
      environmentId: environment.id,
      commitSHA: plan.headSha,
      status: "DEPLOYED",
      workerId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { version: true, workerId: true },
  });
  if (!deployment?.workerId) {
    throw new FlowcordiaFunctionValidationTriggerError(
      "preview_not_ready",
      "The exact proposal head has not finished deploying.",
      409,
      true
    );
  }

  const taskIdentifier = `flowcordia-validate-${input.workflowId}`;
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
    throw new FlowcordiaFunctionValidationTriggerError(
      "task_not_deployed",
      "The exact preview deployment did not discover the generated validation task.",
      409,
      false
    );
  }

  try {
    const idempotencyKey = `flowcordia-validation:${plan.proposalId}:${plan.headSha}:${plan.suite.suiteDigest}:${input.requestId}`;
    const result = await new TriggerTaskService().call(
      taskIdentifier,
      toAuthenticated(environment),
      {
        payload: JSON.stringify(plan.suite),
        options: {
          payloadType: "application/json",
          lockToVersion: deployment.version,
          idempotencyKey,
          idempotencyKeyTTL: "10m",
          metadata: {
            flowcordiaValidationTrigger: {
              workflowId: input.workflowId,
              proposalId: plan.proposalId,
              headSha: plan.headSha,
              suiteDigest: plan.suite.suiteDigest,
            },
          },
        },
      },
      {
        idempotencyKey,
        idempotencyKeyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        triggerSource: "dashboard",
        triggerAction: "flowcordia_function_validation",
      }
    );
    if (!result) {
      throw new FlowcordiaFunctionValidationTriggerError(
        "task_not_deployed",
        "The generated validation task is unavailable in this deployment.",
        409,
        true
      );
    }
    return {
      friendlyId: result.run.friendlyId,
      cached: result.isCached,
      proposalId: plan.proposalId,
      headSha: plan.headSha,
      suiteDigest: plan.suite.suiteDigest,
      functionCount: plan.functionCount,
      caseCount: plan.caseCount,
    };
  } catch (error) {
    if (error instanceof FlowcordiaFunctionValidationTriggerError) throw error;
    throw new FlowcordiaFunctionValidationTriggerError(
      "trigger_failed",
      "Repository function validation could not be started.",
      503,
      true
    );
  }
}
