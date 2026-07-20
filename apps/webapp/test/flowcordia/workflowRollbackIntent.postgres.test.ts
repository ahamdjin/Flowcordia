import { postgresTest } from "@internal/testcontainers";
import { PrismaClient } from "@trigger.dev/database";
import { describe, expect, vi } from "vitest";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";
import {
  claimFlowcordiaRollbackMutation,
  completeFlowcordiaRollbackIntent,
  recordFlowcordiaRollbackIntentFailure,
  renewFlowcordiaRollbackMutation,
  reserveFlowcordiaRollbackIntent,
  retireFlowcordiaRollbackIntent,
  type FlowcordiaRollbackIntentIdentity,
} from "../../app/features/flowcordia/workflows/rollback/intent.server";
import { createTestOrgProjectWithMember } from "../fixtures/environmentVariablesFixtures";

vi.setConfig({ testTimeout: 120_000 });

const firstLeaseToken = "11111111-1111-4111-8111-111111111111";
const secondLeaseToken = "22222222-2222-4222-8222-222222222222";

async function rollbackFixture(prisma: PrismaClient) {
  const { organization, project, user } = await createTestOrgProjectWithMember(prisma);
  const installation = await prisma.githubAppInstallation.create({
    data: {
      appInstallationId: 42n,
      targetId: 84n,
      targetType: "Organization",
      accountHandle: "acme",
      repositorySelection: "SELECTED",
      organizationId: organization.id,
    },
  });
  const repository = await prisma.githubRepository.create({
    data: {
      githubId: 987654321n,
      name: "workflow-repo",
      fullName: "acme/workflow-repo",
      htmlUrl: "https://github.com/acme/workflow-repo",
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
    repository: { owner: "acme", name: repository.name, branch: repository.defaultBranch },
  } satisfies WorkflowIndexScope;
  const identity = {
    scope,
    workflowId: "lead_intake",
    rollbackKey: "9".repeat(64),
    sourceProposalId: "proposal_previous",
    sourceHeadSha: "1".repeat(40),
    sourceMergeCommitSha: "2".repeat(40),
    currentProposalId: "proposal_current",
    currentHeadSha: "3".repeat(40),
    currentMergeCommitSha: "4".repeat(40),
    baseCommitSha: "5".repeat(40),
    baseBlobSha: "6".repeat(40),
    reason: "Restore the last reviewed workflow after a production regression.",
    actorId: user.id,
    creatorReviewerId: "reviewer_123",
    correlationId: "rollback:postgres-concurrency-test",
  } satisfies FlowcordiaRollbackIntentIdentity;
  return { identity, repository };
}

describe("Flowcordia rollback intent PostgreSQL fencing", () => {
  postgresTest(
    "converges concurrent reservations and permits only the winning lease to complete",
    async ({ prisma, postgresContainer }) => {
      const peer = new PrismaClient({
        datasources: { db: { url: postgresContainer.getConnectionUri() } },
      });
      try {
        const { identity, repository } = await rollbackFixture(prisma);
        const [firstReservation, secondReservation] = await Promise.all([
          reserveFlowcordiaRollbackIntent(
            { ...identity, allowFailedRetry: false, expectedFailedIntentId: null },
            prisma
          ),
          reserveFlowcordiaRollbackIntent(
            { ...identity, allowFailedRetry: false, expectedFailedIntentId: null },
            peer
          ),
        ]);
        expect(firstReservation.id).toBe(secondReservation.id);
        await expect(
          prisma.flowcordiaRollbackIntent.count({
            where: { repositoryId: repository.id, rollbackKey: identity.rollbackKey },
          })
        ).resolves.toBe(1);

        const now = new Date("2026-07-20T23:00:00.000Z");
        const leaseExpiresAt = new Date(now.getTime() + 5 * 60_000);
        const claims = await Promise.all([
          claimFlowcordiaRollbackMutation(
            { intentId: firstReservation.id, leaseToken: firstLeaseToken, now, leaseExpiresAt },
            prisma
          ),
          claimFlowcordiaRollbackMutation(
            { intentId: firstReservation.id, leaseToken: secondLeaseToken, now, leaseExpiresAt },
            peer
          ),
        ]);
        expect(claims.filter(Boolean)).toHaveLength(1);
        const winningToken = claims[0] ? firstLeaseToken : secondLeaseToken;
        const losingToken = claims[0] ? secondLeaseToken : firstLeaseToken;

        await expect(
          retireFlowcordiaRollbackIntent(
            {
              intentId: firstReservation.id,
              code: "proposal_missing",
              message: "The proposal was not visible during observation.",
              now,
              invalidateActiveLease: false,
            },
            peer
          )
        ).resolves.toBe(false);
        await expect(
          completeFlowcordiaRollbackIntent(
            {
              intentId: firstReservation.id,
              targetHeadSha: "7".repeat(40),
              pullRequestNumber: 51,
              sourcePatchCount: 1,
              leaseToken: losingToken,
            },
            peer
          )
        ).rejects.toMatchObject({ code: "proposal_reconciling" });

        await completeFlowcordiaRollbackIntent(
          {
            intentId: firstReservation.id,
            targetHeadSha: "7".repeat(40),
            pullRequestNumber: 51,
            sourcePatchCount: 1,
            leaseToken: winningToken,
          },
          prisma
        );
        await expect(
          prisma.flowcordiaRollbackIntent.findUniqueOrThrow({
            where: { id: firstReservation.id },
            select: {
              status: true,
              targetHeadSha: true,
              pullRequestNumber: true,
              sourcePatchCount: true,
              mutationLeaseToken: true,
              mutationLeaseExpiresAt: true,
            },
          })
        ).resolves.toEqual({
          status: "PROPOSAL_CREATED",
          targetHeadSha: "7".repeat(40),
          pullRequestNumber: 51,
          sourcePatchCount: 1,
          mutationLeaseToken: null,
          mutationLeaseExpiresAt: null,
        });
      } finally {
        await peer.$disconnect();
      }
    }
  );

  postgresTest(
    "fences an expired owner after a new lease takes over",
    async ({ prisma, postgresContainer }) => {
      const peer = new PrismaClient({
        datasources: { db: { url: postgresContainer.getConnectionUri() } },
      });
      try {
        const { identity } = await rollbackFixture(prisma);
        const intent = await reserveFlowcordiaRollbackIntent(
          { ...identity, allowFailedRetry: false, expectedFailedIntentId: null },
          prisma
        );
        const firstNow = new Date("2026-07-20T23:00:00.000Z");
        const firstExpiry = new Date(firstNow.getTime() + 60_000);
        await expect(
          claimFlowcordiaRollbackMutation(
            {
              intentId: intent.id,
              leaseToken: firstLeaseToken,
              now: firstNow,
              leaseExpiresAt: firstExpiry,
            },
            prisma
          )
        ).resolves.toBe(true);

        const takeoverNow = new Date(firstExpiry.getTime() + 1);
        const takeoverExpiry = new Date(takeoverNow.getTime() + 60_000);
        await expect(
          claimFlowcordiaRollbackMutation(
            {
              intentId: intent.id,
              leaseToken: secondLeaseToken,
              now: takeoverNow,
              leaseExpiresAt: takeoverExpiry,
            },
            peer
          )
        ).resolves.toBe(true);
        await expect(
          renewFlowcordiaRollbackMutation(
            {
              intentId: intent.id,
              leaseToken: firstLeaseToken,
              now: takeoverNow,
              leaseExpiresAt: takeoverExpiry,
            },
            prisma
          )
        ).resolves.toBe(false);
        await expect(
          recordFlowcordiaRollbackIntentFailure(
            {
              intentId: intent.id,
              code: "stale_worker",
              message: "The old worker must not clear the new lease.",
              terminal: true,
              leaseToken: firstLeaseToken,
            },
            prisma
          )
        ).resolves.toBe(false);
        await expect(
          completeFlowcordiaRollbackIntent(
            {
              intentId: intent.id,
              targetHeadSha: "7".repeat(40),
              pullRequestNumber: 52,
              sourcePatchCount: 0,
              leaseToken: firstLeaseToken,
            },
            prisma
          )
        ).rejects.toMatchObject({ code: "proposal_reconciling" });

        await completeFlowcordiaRollbackIntent(
          {
            intentId: intent.id,
            targetHeadSha: "8".repeat(40),
            pullRequestNumber: 53,
            sourcePatchCount: 0,
            leaseToken: secondLeaseToken,
          },
          peer
        );
        await expect(
          prisma.flowcordiaRollbackIntent.findUniqueOrThrow({
            where: { id: intent.id },
            select: { status: true, targetHeadSha: true, pullRequestNumber: true },
          })
        ).resolves.toEqual({
          status: "PROPOSAL_CREATED",
          targetHeadSha: "8".repeat(40),
          pullRequestNumber: 53,
        });
      } finally {
        await peer.$disconnect();
      }
    }
  );
});
