import { postgresTest } from "@internal/testcontainers";
import type { PrismaClient } from "@trigger.dev/database";
import { describe, expect, vi } from "vitest";
import { queryFlowcordiaOperationsMetrics } from "../../app/features/flowcordia/operations/query.server";
import { recordFlowcordiaOperationsWorkerHeartbeat } from "../../app/features/flowcordia/proposals/worker/heartbeat.server";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";
import { createTestOrgProjectWithMember } from "../fixtures/environmentVariablesFixtures";

vi.setConfig({ testTimeout: 120_000 });

async function scopedRepository(prisma: PrismaClient, label: string, githubId: bigint) {
  const { organization, project, user } = await createTestOrgProjectWithMember(prisma);
  const installation = await prisma.githubAppInstallation.create({
    data: {
      appInstallationId: githubId + 1n,
      targetId: githubId + 2n,
      targetType: "Organization",
      accountHandle: `${label}-account`,
      repositorySelection: "SELECTED",
      organizationId: organization.id,
    },
  });
  const repository = await prisma.githubRepository.create({
    data: {
      githubId,
      name: `${label}-workflows`,
      fullName: `${label}-account/${label}-workflows`,
      htmlUrl: `https://github.com/${label}-account/${label}-workflows`,
      private: true,
      defaultBranch: "main",
      installationId: installation.id,
    },
  });
  const scope = {
    tenantId: organization.id,
    projectId: project.id,
    githubAppInstallationId: installation.id,
    installationId: Number(installation.appInstallationId),
    repositoryId: repository.id,
    repositoryGithubId: repository.githubId.toString(),
    repository: {
      owner: `${label}-account`,
      name: repository.name,
      branch: repository.defaultBranch,
    },
  } satisfies WorkflowIndexScope;
  return { organization, project, user, installation, repository, scope };
}

async function proposal(
  prisma: PrismaClient,
  fixture: Awaited<ReturnType<typeof scopedRepository>>,
  input: { suffix: string; state: "DRAFT" | "RECONCILING"; at: Date }
) {
  return prisma.flowcordiaWorkflowProposal.create({
    data: {
      proposalId: `${fixture.repository.name}-${input.suffix}`,
      workflowId: `workflow_${input.suffix}`,
      workflowPath: `.flowcordia/workflows/workflow_${input.suffix}.json`,
      desiredWorkflowSha256: input.suffix.padEnd(64, "a").slice(0, 64),
      organizationId: fixture.organization.id,
      projectId: fixture.project.id,
      githubAppInstallationId: fixture.installation.id,
      appInstallationId: fixture.installation.appInstallationId,
      repositoryId: fixture.repository.id,
      repositoryGithubId: fixture.repository.githubId,
      repositoryOwner: fixture.scope.repository.owner,
      repositoryName: fixture.repository.name,
      baseBranch: "main",
      baseCommitSha: "1".repeat(40),
      proposalBranch: `flowcordia/${input.suffix}`,
      createdByUserId: fixture.user.id,
      state: input.state,
      operation: "create",
      lastCorrelationId: `operations-${input.suffix}`,
      lastReconciledAt: input.at,
      createdAt: input.at,
      updatedAt: input.at,
    },
  });
}

describe("Flowcordia operations readiness PostgreSQL scope", () => {
  postgresTest(
    "reads only the selected tenant, project, and repository and counts only due reconciliation",
    async ({ prisma }) => {
      const now = new Date("2026-07-21T00:00:00.000Z");
      const old = new Date(now.getTime() - 10 * 60_000);
      const future = new Date(now.getTime() + 10 * 60_000);
      const selected = await scopedRepository(prisma, "selected", 1_000n);
      const other = await scopedRepository(prisma, "other", 2_000n);
      const selectedStale = await proposal(prisma, selected, {
        suffix: "selected_stale",
        state: "RECONCILING",
        at: old,
      });
      const selectedFuture = await proposal(prisma, selected, {
        suffix: "selected_future",
        state: "DRAFT",
        at: old,
      });
      const otherStale = await proposal(prisma, other, {
        suffix: "other_stale",
        state: "RECONCILING",
        at: old,
      });

      await prisma.flowcordiaOutboxEvent.createMany({
        data: [
          {
            organizationId: selected.organization.id,
            dedupeKey: "selected-outbox",
            eventType: "proposal.created",
            aggregateType: "flowcordia.workflow_proposal",
            aggregateId: selectedStale.id,
            payload: {},
            occurredAt: old,
            availableAt: future,
            attempts: 2,
            lockedBy: "expired-selected-worker",
            lockToken: "selected-lock-token",
            lockExpiresAt: old,
          },
          {
            organizationId: other.organization.id,
            dedupeKey: "other-outbox",
            eventType: "proposal.created",
            aggregateType: "flowcordia.workflow_proposal",
            aggregateId: otherStale.id,
            payload: {},
            occurredAt: old,
            availableAt: old,
            attempts: 99,
            lockedBy: "expired-other-worker",
            lockToken: "other-lock-token",
            lockExpiresAt: old,
          },
        ],
      });
      await prisma.flowcordiaProposalReconciliation.createMany({
        data: [
          {
            proposalStorageId: selectedStale.id,
            availableAt: old,
            attempts: 3,
            lockedBy: "expired-selected-worker",
            lockToken: "selected-reconciliation-token",
            lockExpiresAt: old,
          },
          { proposalStorageId: selectedFuture.id, availableAt: future, attempts: 0 },
          {
            proposalStorageId: otherStale.id,
            availableAt: old,
            attempts: 88,
            lockedBy: "expired-other-worker",
            lockToken: "other-reconciliation-token",
            lockExpiresAt: old,
          },
        ],
      });
      await recordFlowcordiaOperationsWorkerHeartbeat(
        {
          now: new Date(now.getTime() - 5_000),
          healthyWindowMs: 30_000,
          config: {
            pollIntervalMs: 1_000,
            reconciliationRefreshMs: 120_000,
            reconciliationStaleMs: 60_000,
          },
        },
        prisma
      );

      await expect(
        queryFlowcordiaOperationsMetrics({ scope: selected.scope, now }, prisma)
      ).resolves.toMatchObject({
        workerActive: true,
        workerHeartbeatAgeMs: 5_000,
        unpublishedOutboxCount: 1,
        oldestUnpublishedOutboxAgeMs: 600_000,
        maximumOutboxAttempts: 2,
        expiredOutboxLocks: 1,
        pendingReconciliationCount: 1,
        oldestReconciliationDelayMs: 600_000,
        maximumReconciliationAttempts: 3,
        expiredReconciliationLocks: 1,
        staleReconcilingProposalCount: 1,
        recentFailedProposalCount: 0,
      });
    }
  );
});
