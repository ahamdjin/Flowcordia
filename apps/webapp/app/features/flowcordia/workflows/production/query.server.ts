import type { WorkflowIndexScope } from "../index/types";
import { prisma } from "~/db.server";
import {
  flowcordiaProductionRunIdempotencyPrefix,
  selectFlowcordiaProductionRun,
} from "./identity";
import { presentFlowcordiaProduction } from "./presentation";
import { findLatestMergedFlowcordiaProposal } from "./repository.server";

export async function queryFlowcordiaProduction(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
}) {
  const proposal = await findLatestMergedFlowcordiaProposal({
    scope: input.scope,
    workflowId: input.workflowId,
  });
  const environment = proposal
    ? await prisma.runtimeEnvironment.findFirst({
        where: {
          organizationId: input.scope.tenantId,
          projectId: input.scope.projectId,
          type: "PRODUCTION",
          archivedAt: null,
        },
        select: { id: true },
      })
    : null;
  const deployment = environment
    ? await prisma.workerDeployment.findFirst({
        where: {
          projectId: input.scope.projectId,
          environmentId: environment.id,
        },
        orderBy: { createdAt: "desc" },
        select: {
          shortCode: true,
          version: true,
          status: true,
          commitSHA: true,
          createdAt: true,
          deployedAt: true,
          workerId: true,
        },
      })
    : null;
  const identity =
    proposal?.mergeCommitSha &&
    deployment?.status === "DEPLOYED" &&
    deployment.workerId &&
    deployment.commitSHA === proposal.mergeCommitSha
      ? {
          workflowId: input.workflowId,
          proposalId: proposal.proposalId,
          mergeCommitSha: proposal.mergeCommitSha,
        }
      : null;
  const runs =
    environment && deployment?.workerId && identity
      ? await prisma.taskRun.findMany({
          where: {
            projectId: input.scope.projectId,
            runtimeEnvironmentId: environment.id,
            taskIdentifier: `flowcordia-${input.workflowId}`,
            lockedToVersionId: deployment.workerId,
            idempotencyKey: {
              startsWith: flowcordiaProductionRunIdempotencyPrefix(identity),
            },
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
            lockedToVersionId: true,
          },
        })
      : [];
  const run = identity ? selectFlowcordiaProductionRun(runs, identity) : null;

  return presentFlowcordiaProduction({
    workflowId: input.workflowId,
    proposal,
    environment,
    deployment,
    run,
  });
}
