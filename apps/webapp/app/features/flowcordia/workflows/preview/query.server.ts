import type { WorkflowIndexScope } from "../index/types";
import { prisma } from "~/db.server";
import { flowcordiaProposalStore } from "../../proposals/prisma.server";
import { flowcordiaPreviewRunIdempotencyPrefix, selectFlowcordiaPreviewRun } from "./identity";
import { presentFlowcordiaPreview } from "./presentation";

export async function queryFlowcordiaPreview(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
}) {
  const [proposals, connection] = await Promise.all([
    flowcordiaProposalStore.listProposals({
      tenantId: input.scope.tenantId,
      projectId: input.scope.projectId,
      repositoryId: input.scope.repositoryId,
      limit: 100,
    }),
    prisma.connectedGithubRepository.findFirst({
      where: {
        projectId: input.scope.projectId,
        repositoryId: input.scope.repositoryId,
        project: { organizationId: input.scope.tenantId, deletedAt: null },
      },
      select: { previewDeploymentsEnabled: true },
    }),
  ]);
  const workflowProposals = proposals.filter(
    (candidate) => candidate.workflowId === input.workflowId
  );
  const proposal =
    workflowProposals.find((candidate) => !["MERGED", "CLOSED"].includes(candidate.state)) ??
    workflowProposals[0] ??
    null;
  const environment = proposal
    ? await prisma.runtimeEnvironment.findFirst({
        where: {
          organizationId: input.scope.tenantId,
          projectId: input.scope.projectId,
          type: "PREVIEW",
          parentEnvironmentId: { not: null },
          branchName: proposal.proposalBranch,
          archivedAt: null,
        },
        select: { id: true, branchName: true },
      })
    : null;
  const deployment =
    environment && proposal?.headSha
      ? await prisma.workerDeployment.findFirst({
          where: {
            projectId: input.scope.projectId,
            environmentId: environment.id,
            commitSHA: proposal.headSha,
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
  const expectedRunIdentity =
    proposal?.headSha && deployment?.workerId
      ? {
          workflowId: input.workflowId,
          proposalId: proposal.proposalId,
          headSha: proposal.headSha,
        }
      : null;
  const runs =
    environment && deployment?.workerId && expectedRunIdentity
      ? await prisma.taskRun.findMany({
          where: {
            projectId: input.scope.projectId,
            runtimeEnvironmentId: environment.id,
            taskIdentifier: `flowcordia-${input.workflowId}`,
            lockedToVersionId: deployment.workerId,
            idempotencyKey: {
              startsWith: flowcordiaPreviewRunIdempotencyPrefix(expectedRunIdentity),
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
  const run = expectedRunIdentity ? selectFlowcordiaPreviewRun(runs, expectedRunIdentity) : null;

  return presentFlowcordiaPreview({
    workflowId: input.workflowId,
    previewDeploymentsEnabled: connection?.previewDeploymentsEnabled ?? false,
    proposal,
    environment,
    deployment,
    run,
  });
}
