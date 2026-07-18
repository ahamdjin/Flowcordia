import { prisma } from "~/db.server";
import { flowcordiaProposalStore } from "../../proposals/prisma.server";
import type { WorkflowIndexScope } from "../index/types";
import {
  presentFlowcordiaFunctionValidationMetadata,
  presentFlowcordiaFunctionValidationRunIdentity,
  type FlowcordiaFunctionValidationProjection,
} from "./presentation";
import {
  buildFlowcordiaFunctionValidationPlan,
  FlowcordiaFunctionValidationSuiteError,
} from "./suite.server";

const TERMINAL_RUN_STATUSES = new Set([
  "COMPLETED_SUCCESSFULLY",
  "COMPLETED_WITH_ERRORS",
  "CANCELED",
  "SYSTEM_FAILURE",
  "CRASHED",
  "INTERRUPTED",
  "EXPIRED",
  "TIMED_OUT",
]);
const FAILED_DEPLOYMENT_STATUSES = new Set(["FAILED", "CANCELED", "TIMED_OUT"]);

function proposalProjection(proposal: {
  proposalId: string;
  headSha: string | null;
  pullRequestNumber: number | null;
}): FlowcordiaFunctionValidationProjection["proposal"] {
  return proposal.headSha
    ? {
        proposalId: proposal.proposalId,
        headSha: proposal.headSha,
        pullRequestNumber: proposal.pullRequestNumber,
      }
    : null;
}

function projection(input: {
  state: FlowcordiaFunctionValidationProjection["state"];
  message: string;
  proposal: FlowcordiaFunctionValidationProjection["proposal"];
  suite?: FlowcordiaFunctionValidationProjection["suite"];
  latestRun?: FlowcordiaFunctionValidationProjection["latestRun"];
}): FlowcordiaFunctionValidationProjection {
  return {
    state: input.state,
    message: input.message,
    proposal: input.proposal,
    suite: input.suite ?? null,
    latestRun: input.latestRun ?? null,
  };
}

export async function queryFlowcordiaFunctionValidation(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
  expectedProposalId?: string;
  expectedHeadSha?: string;
}): Promise<FlowcordiaFunctionValidationProjection> {
  const proposals = await flowcordiaProposalStore.listProposals({
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    repositoryId: input.scope.repositoryId,
    limit: 100,
  });
  const workflowProposals = proposals.filter(
    (candidate) => candidate.workflowId === input.workflowId
  );
  const expectsExactProposal = Boolean(input.expectedProposalId || input.expectedHeadSha);
  const proposal = expectsExactProposal
    ? workflowProposals.find(
        (candidate) =>
          candidate.proposalId === input.expectedProposalId &&
          candidate.headSha === input.expectedHeadSha
      )
    : (workflowProposals.find(
        (candidate) => !["MERGED", "CLOSED"].includes(candidate.state)
      ) ?? workflowProposals[0]);

  if (!proposal) {
    return projection({
      state: expectsExactProposal ? "BLOCKED" : "NOT_REQUESTED",
      message: expectsExactProposal
        ? "The exact proposal head is no longer available for repository function validation."
        : "Publish a proposal before validating repository functions.",
      proposal: null,
    });
  }

  const presentedProposal = proposalProjection(proposal);
  if (["MERGED", "CLOSED"].includes(proposal.state)) {
    return projection({
      state: "CLOSED",
      message: "This proposal no longer owns an active repository function validation gate.",
      proposal: presentedProposal,
    });
  }
  if (proposal.state === "FAILED") {
    return projection({
      state: "BLOCKED",
      message: "The proposal failed before repository function validation could complete.",
      proposal: presentedProposal,
    });
  }
  if (!proposal.headSha) {
    return projection({
      state: "WAITING_FOR_DEPLOYMENT",
      message: "Waiting for the proposal to publish an exact head revision.",
      proposal: null,
    });
  }

  let plan: Awaited<ReturnType<typeof buildFlowcordiaFunctionValidationPlan>>;
  try {
    plan = await buildFlowcordiaFunctionValidationPlan({
      scope: input.scope,
      workflowId: input.workflowId,
      expectedHeadSha: proposal.headSha,
    });
  } catch (error) {
    if (error instanceof FlowcordiaFunctionValidationSuiteError) {
      return projection({
        state: error.retryable ? "UNAVAILABLE" : "BLOCKED",
        message: error.message,
        proposal: presentedProposal,
      });
    }
    throw error;
  }

  if (!plan.required) {
    return projection({
      state: "NOT_REQUIRED",
      message: "This workflow does not use repository-owned typed functions.",
      proposal: presentedProposal,
    });
  }

  const suite = {
    digest: plan.suite.suiteDigest,
    functionCount: plan.functionCount,
    caseCount: plan.caseCount,
  };
  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      organizationId: input.scope.tenantId,
      projectId: input.scope.projectId,
      type: "PREVIEW",
      parentEnvironmentId: { not: null },
      branchName: proposal.proposalBranch,
      archivedAt: null,
    },
    select: { id: true, branchName: true },
  });
  if (!environment || environment.branchName !== proposal.proposalBranch) {
    return projection({
      state: "WAITING_FOR_DEPLOYMENT",
      message: "Waiting for the exact proposal preview environment.",
      proposal: presentedProposal,
      suite,
    });
  }

  const deployment = await prisma.workerDeployment.findFirst({
    where: {
      projectId: input.scope.projectId,
      environmentId: environment.id,
      commitSHA: proposal.headSha,
    },
    orderBy: { createdAt: "desc" },
    select: { version: true, status: true, workerId: true },
  });
  if (deployment && FAILED_DEPLOYMENT_STATUSES.has(deployment.status)) {
    return projection({
      state: "BLOCKED",
      message: "The exact proposal deployment failed before repository functions could be validated.",
      proposal: presentedProposal,
      suite,
    });
  }
  if (!deployment?.workerId || deployment.status !== "DEPLOYED") {
    return projection({
      state: "WAITING_FOR_DEPLOYMENT",
      message: "Waiting for the exact proposal head to finish deploying.",
      proposal: presentedProposal,
      suite,
    });
  }

  const expectedIdentity = {
    workflowId: input.workflowId,
    proposalId: plan.proposalId,
    headSha: plan.headSha,
    suiteDigest: plan.suite.suiteDigest,
  };
  const runs = await prisma.taskRun.findMany({
    where: {
      projectId: input.scope.projectId,
      runtimeEnvironmentId: environment.id,
      taskIdentifier: `flowcordia-validate-${input.workflowId}`,
      lockedToVersionId: deployment.workerId,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      friendlyId: true,
      status: true,
      metadata: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  });
  const run = runs.find((candidate) => {
    const identity = presentFlowcordiaFunctionValidationRunIdentity(candidate.metadata);
    return (
      identity?.workflowId === expectedIdentity.workflowId &&
      identity.proposalId === expectedIdentity.proposalId &&
      identity.headSha === expectedIdentity.headSha &&
      identity.suiteDigest === expectedIdentity.suiteDigest
    );
  });
  if (!run) {
    return projection({
      state: "READY_TO_RUN",
      message: `The exact deployment is ready to execute ${plan.caseCount} repository fixture case${plan.caseCount === 1 ? "" : "s"}.`,
      proposal: presentedProposal,
      suite,
    });
  }

  const validation = presentFlowcordiaFunctionValidationMetadata(run.metadata, expectedIdentity);
  const latestRun = {
    friendlyId: run.friendlyId,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    validation,
  };
  const terminal = TERMINAL_RUN_STATUSES.has(run.status);
  if (
    validation?.status === "PASSED" &&
    run.status === "COMPLETED_SUCCESSFULLY" &&
    validation.failedCount === 0 &&
    validation.passedCount === plan.caseCount
  ) {
    return projection({
      state: "PASSED",
      message: `All ${validation.passedCount} repository fixture cases passed on this exact proposal head.`,
      proposal: presentedProposal,
      suite,
      latestRun,
    });
  }
  if (validation?.status === "FAILED" || terminal) {
    return projection({
      state: "FAILED",
      message: validation
        ? `Repository function validation failed ${validation.failedCount} of ${plan.caseCount} fixture cases.`
        : "The validation run completed without trustworthy exact-head result metadata.",
      proposal: presentedProposal,
      suite,
      latestRun,
    });
  }
  if (run.startedAt || validation?.status === "RUNNING" || validation?.status === "PASSED") {
    return projection({
      state: "RUNNING",
      message: `Repository function validation is executing ${plan.caseCount} fixture cases on the exact deployment.`,
      proposal: presentedProposal,
      suite,
      latestRun,
    });
  }
  return projection({
    state: "QUEUED",
    message: "Repository function validation is queued on the exact proposal deployment.",
    proposal: presentedProposal,
    suite,
    latestRun,
  });
}
