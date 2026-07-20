import { Prisma, prisma } from "~/db.server";
import type { WorkflowIndexScope } from "../index/types";
import { FlowcordiaRollbackError } from "./errors";

const MAX_DATABASE_BIGINT = 9_223_372_036_854_775_807n;

type RollbackIntentStatus = "PENDING" | "PROPOSAL_CREATED" | "FAILED";

export interface FlowcordiaRollbackIntentIdentity {
  scope: WorkflowIndexScope;
  workflowId: string;
  sourceProposalId: string;
  sourceHeadSha: string;
  sourceMergeCommitSha: string;
  currentProposalId: string;
  currentHeadSha: string;
  currentMergeCommitSha: string;
  baseCommitSha: string;
  baseBlobSha: string;
  targetProposalId: string;
  reason: string;
  actorId: string;
  correlationId: string;
}

export interface FlowcordiaRollbackIntentRecord {
  id: string;
  status: RollbackIntentStatus;
  targetProposalId: string;
  targetHeadSha: string | null;
  pullRequestNumber: number | null;
  sourcePatchCount: number | null;
}

function installationId(value: number): bigint {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The rollback installation identity is invalid.",
      409,
      false
    );
  }
  return BigInt(value);
}

function repositoryGithubId(value: string): bigint {
  if (!/^[1-9][0-9]{0,18}$/.test(value)) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The rollback repository identity is invalid.",
      409,
      false
    );
  }
  const parsed = BigInt(value);
  if (parsed > MAX_DATABASE_BIGINT) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The rollback repository identity exceeds database bounds.",
      409,
      false
    );
  }
  return parsed;
}

const selectIntent = {
  id: true,
  organizationId: true,
  projectId: true,
  githubAppInstallationId: true,
  appInstallationId: true,
  repositoryId: true,
  repositoryGithubId: true,
  workflowId: true,
  sourceProposalId: true,
  sourceHeadSha: true,
  sourceMergeCommitSha: true,
  currentProposalId: true,
  currentHeadSha: true,
  currentMergeCommitSha: true,
  baseCommitSha: true,
  baseBlobSha: true,
  targetProposalId: true,
  reason: true,
  status: true,
  targetHeadSha: true,
  pullRequestNumber: true,
  sourcePatchCount: true,
} as const;

type StoredIntent = Prisma.FlowcordiaRollbackIntentGetPayload<{ select: typeof selectIntent }>;

function exactIdentityMatches(
  stored: StoredIntent,
  input: FlowcordiaRollbackIntentIdentity,
  appInstallationId: bigint,
  githubRepositoryId: bigint
): boolean {
  return (
    stored.organizationId === input.scope.tenantId &&
    stored.projectId === input.scope.projectId &&
    stored.githubAppInstallationId === input.scope.githubAppInstallationId &&
    stored.appInstallationId === appInstallationId &&
    stored.repositoryId === input.scope.repositoryId &&
    stored.repositoryGithubId === githubRepositoryId &&
    stored.workflowId === input.workflowId &&
    stored.sourceProposalId === input.sourceProposalId &&
    stored.sourceHeadSha === input.sourceHeadSha &&
    stored.sourceMergeCommitSha === input.sourceMergeCommitSha &&
    stored.currentProposalId === input.currentProposalId &&
    stored.currentHeadSha === input.currentHeadSha &&
    stored.currentMergeCommitSha === input.currentMergeCommitSha &&
    stored.baseCommitSha === input.baseCommitSha &&
    stored.baseBlobSha === input.baseBlobSha &&
    stored.targetProposalId === input.targetProposalId &&
    stored.reason === input.reason
  );
}

function present(stored: StoredIntent): FlowcordiaRollbackIntentRecord {
  return {
    id: stored.id,
    status: stored.status,
    targetProposalId: stored.targetProposalId,
    targetHeadSha: stored.targetHeadSha,
    pullRequestNumber: stored.pullRequestNumber,
    sourcePatchCount: stored.sourcePatchCount,
  };
}

async function readByTarget(input: FlowcordiaRollbackIntentIdentity): Promise<StoredIntent | null> {
  return prisma.flowcordiaRollbackIntent.findUnique({
    where: {
      repositoryId_targetProposalId: {
        repositoryId: input.scope.repositoryId,
        targetProposalId: input.targetProposalId,
      },
    },
    select: selectIntent,
  });
}

function assertReusable(
  stored: StoredIntent,
  input: FlowcordiaRollbackIntentIdentity,
  appInstallationId: bigint,
  githubRepositoryId: bigint
): FlowcordiaRollbackIntentRecord {
  if (!exactIdentityMatches(stored, input, appInstallationId, githubRepositoryId)) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The rollback proposal identity is already bound to different immutable provenance.",
      409,
      false
    );
  }
  if (stored.status === "FAILED") {
    throw new FlowcordiaRollbackError(
      "proposal_failed",
      "This rollback intent ended in a definitive failure. Refresh Studio and create a new governed rollback from the current version.",
      409,
      false
    );
  }
  return present(stored);
}

export async function reserveFlowcordiaRollbackIntent(
  input: FlowcordiaRollbackIntentIdentity
): Promise<FlowcordiaRollbackIntentRecord> {
  const appInstallationId = installationId(input.scope.installationId);
  const githubRepositoryId = repositoryGithubId(input.scope.repositoryGithubId);
  const existing = await readByTarget(input);
  if (existing) return assertReusable(existing, input, appInstallationId, githubRepositoryId);

  try {
    const created = await prisma.flowcordiaRollbackIntent.create({
      data: {
        organizationId: input.scope.tenantId,
        projectId: input.scope.projectId,
        githubAppInstallationId: input.scope.githubAppInstallationId,
        appInstallationId,
        repositoryId: input.scope.repositoryId,
        repositoryGithubId: githubRepositoryId,
        workflowId: input.workflowId,
        sourceProposalId: input.sourceProposalId,
        sourceHeadSha: input.sourceHeadSha,
        sourceMergeCommitSha: input.sourceMergeCommitSha,
        currentProposalId: input.currentProposalId,
        currentHeadSha: input.currentHeadSha,
        currentMergeCommitSha: input.currentMergeCommitSha,
        baseCommitSha: input.baseCommitSha,
        baseBlobSha: input.baseBlobSha,
        targetProposalId: input.targetProposalId,
        reason: input.reason,
        createdByUserId: input.actorId,
        correlationId: input.correlationId,
      },
      select: selectIntent,
    });
    return present(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await readByTarget(input);
      if (raced) return assertReusable(raced, input, appInstallationId, githubRepositoryId);
    }
    throw new FlowcordiaRollbackError(
      "proposal_failed",
      "The rollback intent could not be persisted before proposal creation.",
      503,
      true
    );
  }
}

export async function completeFlowcordiaRollbackIntent(input: {
  intentId: string;
  targetHeadSha: string;
  pullRequestNumber: number | null;
  sourcePatchCount: number;
}): Promise<void> {
  const existing = await prisma.flowcordiaRollbackIntent.findUnique({
    where: { id: input.intentId },
    select: {
      status: true,
      targetHeadSha: true,
      pullRequestNumber: true,
      sourcePatchCount: true,
    },
  });
  if (!existing || existing.status === "FAILED") {
    throw new FlowcordiaRollbackError(
      "proposal_failed",
      "Rollback proposal provenance changed before completion.",
      409,
      false
    );
  }
  if (existing.status === "PROPOSAL_CREATED") {
    if (
      existing.targetHeadSha === input.targetHeadSha &&
      existing.pullRequestNumber === input.pullRequestNumber &&
      existing.sourcePatchCount === input.sourcePatchCount
    ) {
      return;
    }
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "Completed rollback provenance cannot be overwritten with a different proposal result.",
      409,
      false
    );
  }

  const updated = await prisma.flowcordiaRollbackIntent.updateMany({
    where: { id: input.intentId, status: "PENDING" },
    data: {
      status: "PROPOSAL_CREATED",
      targetHeadSha: input.targetHeadSha,
      pullRequestNumber: input.pullRequestNumber,
      sourcePatchCount: input.sourcePatchCount,
      failureCode: null,
      failureMessage: null,
    },
  });
  if (updated.count !== 1) {
    throw new FlowcordiaRollbackError(
      "proposal_failed",
      "Rollback proposal provenance changed before completion.",
      409,
      false
    );
  }
}

export async function recordFlowcordiaRollbackIntentFailure(input: {
  intentId: string;
  code: string;
  message: string;
  retryable: boolean;
}): Promise<void> {
  await prisma.flowcordiaRollbackIntent.updateMany({
    where: { id: input.intentId, status: "PENDING" },
    data: {
      status: input.retryable ? "PENDING" : "FAILED",
      failureCode: input.code.slice(0, 128),
      failureMessage: input.message.slice(0, 1000),
    },
  });
}
