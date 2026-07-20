import { Prisma, prisma, type PrismaClientOrTransaction } from "~/db.server";
import { isValidProposalId } from "@flowcordia/github-proposals";
import { isValidWorkflowId, MAX_GITHUB_SOURCE_PATCH_FILES } from "@flowcordia/github-workflows";
import type { WorkflowIndexScope } from "../index/types";
import { flowcordiaRollbackProposalId } from "./contract";
import { FlowcordiaRollbackError } from "./errors";

const MAX_DATABASE_BIGINT = 9_223_372_036_854_775_807n;
const MAX_ROLLBACK_ATTEMPTS = 99_999;
const MUTATION_LEASE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type RollbackIntentStatus = "PENDING" | "PROPOSAL_CREATED" | "FAILED";
type RollbackIntentDatabase = Pick<PrismaClientOrTransaction, "flowcordiaRollbackIntent">;

export interface FlowcordiaRollbackIntentIdentity {
  scope: WorkflowIndexScope;
  workflowId: string;
  rollbackKey: string;
  sourceProposalId: string;
  sourceHeadSha: string;
  sourceMergeCommitSha: string;
  currentProposalId: string;
  currentHeadSha: string;
  currentMergeCommitSha: string;
  baseCommitSha: string;
  baseBlobSha: string;
  reason: string;
  actorId: string;
  creatorReviewerId: string | null;
  correlationId: string;
}

export interface FlowcordiaRollbackIntentRecord {
  id: string;
  status: RollbackIntentStatus;
  resumed: boolean;
  rollbackKey: string;
  attemptNumber: number;
  targetProposalId: string;
  targetHeadSha: string | null;
  pullRequestNumber: number | null;
  sourcePatchCount: number | null;
  creatorReviewerId: string | null;
}

export interface FlowcordiaRollbackRecoveryIntentRecord extends FlowcordiaRollbackIntentRecord {
  workflowId: string;
  sourceProposalId: string;
  sourceHeadSha: string;
  sourceMergeCommitSha: string;
  currentProposalId: string;
  currentHeadSha: string;
  currentMergeCommitSha: string;
  baseCommitSha: string;
  baseBlobSha: string;
  mutationLeaseExpiresAt: Date | null;
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

function intentScopeWhere(scope: WorkflowIndexScope) {
  return {
    organizationId: scope.tenantId,
    projectId: scope.projectId,
    githubAppInstallationId: scope.githubAppInstallationId,
    appInstallationId: installationId(scope.installationId),
    repositoryId: scope.repositoryId,
    repositoryGithubId: repositoryGithubId(scope.repositoryGithubId),
  };
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
  rollbackKey: true,
  attemptNumber: true,
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
  creatorReviewerId: true,
  status: true,
  targetHeadSha: true,
  pullRequestNumber: true,
  sourcePatchCount: true,
  mutationLeaseExpiresAt: true,
} as const;

type StoredIntent = Prisma.FlowcordiaRollbackIntentGetPayload<{ select: typeof selectIntent }>;

function exactIdentityMatches(
  stored: StoredIntent,
  input: FlowcordiaRollbackIntentIdentity,
  appInstallationId: bigint,
  githubRepositoryId: bigint
): boolean {
  const expectedTargetProposalId = flowcordiaRollbackProposalId({
    rollbackKey: input.rollbackKey,
    attemptNumber: stored.attemptNumber,
  });
  return (
    stored.organizationId === input.scope.tenantId &&
    stored.projectId === input.scope.projectId &&
    stored.githubAppInstallationId === input.scope.githubAppInstallationId &&
    stored.appInstallationId === appInstallationId &&
    stored.repositoryId === input.scope.repositoryId &&
    stored.repositoryGithubId === githubRepositoryId &&
    stored.workflowId === input.workflowId &&
    stored.rollbackKey === input.rollbackKey &&
    stored.sourceProposalId === input.sourceProposalId &&
    stored.sourceHeadSha === input.sourceHeadSha &&
    stored.sourceMergeCommitSha === input.sourceMergeCommitSha &&
    stored.currentProposalId === input.currentProposalId &&
    stored.currentHeadSha === input.currentHeadSha &&
    stored.currentMergeCommitSha === input.currentMergeCommitSha &&
    stored.baseCommitSha === input.baseCommitSha &&
    stored.baseBlobSha === input.baseBlobSha &&
    stored.targetProposalId === expectedTargetProposalId
  );
}

function present(stored: StoredIntent, resumed = true): FlowcordiaRollbackIntentRecord {
  return {
    id: stored.id,
    status: stored.status,
    resumed,
    rollbackKey: stored.rollbackKey,
    attemptNumber: stored.attemptNumber,
    targetProposalId: stored.targetProposalId,
    targetHeadSha: stored.targetHeadSha,
    pullRequestNumber: stored.pullRequestNumber,
    sourcePatchCount: stored.sourcePatchCount,
    creatorReviewerId: stored.creatorReviewerId,
  };
}

function presentRecovery(stored: StoredIntent): FlowcordiaRollbackRecoveryIntentRecord {
  return {
    ...present(stored),
    workflowId: stored.workflowId,
    sourceProposalId: stored.sourceProposalId,
    sourceHeadSha: stored.sourceHeadSha,
    sourceMergeCommitSha: stored.sourceMergeCommitSha,
    currentProposalId: stored.currentProposalId,
    currentHeadSha: stored.currentHeadSha,
    currentMergeCommitSha: stored.currentMergeCommitSha,
    baseCommitSha: stored.baseCommitSha,
    baseBlobSha: stored.baseBlobSha,
    mutationLeaseExpiresAt: stored.mutationLeaseExpiresAt,
  };
}

async function readByAttempt(
  input: {
    scope: WorkflowIndexScope;
    rollbackKey: string;
    attemptNumber: number;
  },
  database: RollbackIntentDatabase
): Promise<StoredIntent | null> {
  return database.flowcordiaRollbackIntent.findUnique({
    where: {
      repositoryId_rollbackKey_attemptNumber: {
        repositoryId: input.scope.repositoryId,
        rollbackKey: input.rollbackKey,
        attemptNumber: input.attemptNumber,
      },
    },
    select: selectIntent,
  });
}

export async function readLatestFlowcordiaRollbackIntent(
  input: {
    scope: WorkflowIndexScope;
    rollbackKey: string;
  },
  database: RollbackIntentDatabase = prisma
): Promise<FlowcordiaRollbackIntentRecord | null> {
  if (!/^[0-9a-f]{64}$/.test(input.rollbackKey)) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The rollback key is invalid.",
      409,
      false
    );
  }
  const latest = await database.flowcordiaRollbackIntent.findFirst({
    where: {
      ...intentScopeWhere(input.scope),
      rollbackKey: input.rollbackKey,
    },
    orderBy: { attemptNumber: "desc" },
    select: selectIntent,
  });
  return latest ? present(latest) : null;
}

export async function readFlowcordiaRollbackIntentByProposal(
  input: {
    scope: WorkflowIndexScope;
    workflowId: string;
    proposalId: string;
  },
  database: RollbackIntentDatabase = prisma
): Promise<FlowcordiaRollbackRecoveryIntentRecord | null> {
  if (!isValidWorkflowId(input.workflowId) || !isValidProposalId(input.proposalId)) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The rollback attempt identity is invalid.",
      409,
      false
    );
  }
  const stored = await database.flowcordiaRollbackIntent.findFirst({
    where: {
      ...intentScopeWhere(input.scope),
      workflowId: input.workflowId,
      targetProposalId: input.proposalId,
    },
    select: selectIntent,
  });
  return stored ? presentRecovery(stored) : null;
}

export async function claimFlowcordiaRollbackMutation(
  input: {
    intentId: string;
    leaseToken: string;
    now: Date;
    leaseExpiresAt: Date;
  },
  database: RollbackIntentDatabase = prisma
): Promise<boolean> {
  if (
    !MUTATION_LEASE_TOKEN_PATTERN.test(input.leaseToken) ||
    input.leaseExpiresAt.getTime() <= input.now.getTime() ||
    input.leaseExpiresAt.getTime() - input.now.getTime() > 5 * 60_000
  ) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The rollback mutation lease is invalid.",
      409,
      false
    );
  }
  const claimed = await database.flowcordiaRollbackIntent.updateMany({
    where: {
      id: input.intentId,
      status: "PENDING",
      OR: [
        { mutationLeaseToken: null, mutationLeaseExpiresAt: null },
        { mutationLeaseExpiresAt: { lt: input.now } },
      ],
    },
    data: {
      mutationLeaseToken: input.leaseToken,
      mutationLeaseExpiresAt: input.leaseExpiresAt,
    },
  });
  return claimed.count === 1;
}

export async function renewFlowcordiaRollbackMutation(
  input: {
    intentId: string;
    leaseToken: string;
    now: Date;
    leaseExpiresAt: Date;
  },
  database: RollbackIntentDatabase = prisma
): Promise<boolean> {
  if (
    !MUTATION_LEASE_TOKEN_PATTERN.test(input.leaseToken) ||
    input.leaseExpiresAt.getTime() <= input.now.getTime() ||
    input.leaseExpiresAt.getTime() - input.now.getTime() > 5 * 60_000
  ) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The rollback mutation lease renewal is invalid.",
      409,
      false
    );
  }
  const renewed = await database.flowcordiaRollbackIntent.updateMany({
    where: {
      id: input.intentId,
      status: "PENDING",
      mutationLeaseToken: input.leaseToken,
      mutationLeaseExpiresAt: { gte: input.now },
    },
    data: { mutationLeaseExpiresAt: input.leaseExpiresAt },
  });
  return renewed.count === 1;
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
      "rollback_retry_required",
      "This rollback attempt ended in a definitive failure. Review and abandon it before explicitly retrying.",
      409,
      false
    );
  }
  return present(stored);
}

export async function reserveFlowcordiaRollbackIntent(
  input: FlowcordiaRollbackIntentIdentity & {
    allowFailedRetry: boolean;
    expectedFailedIntentId: string | null;
  },
  database: RollbackIntentDatabase = prisma
): Promise<FlowcordiaRollbackIntentRecord> {
  const appInstallationId = installationId(input.scope.installationId);
  const githubRepositoryId = repositoryGithubId(input.scope.repositoryGithubId);
  const latest = await database.flowcordiaRollbackIntent.findFirst({
    where: {
      ...intentScopeWhere(input.scope),
      rollbackKey: input.rollbackKey,
    },
    orderBy: { attemptNumber: "desc" },
    select: selectIntent,
  });
  if (latest && latest.status !== "FAILED") {
    return assertReusable(latest, input, appInstallationId, githubRepositoryId);
  }
  if (latest?.status === "FAILED" && !input.allowFailedRetry) {
    throw new FlowcordiaRollbackError(
      "rollback_retry_required",
      "The previous rollback attempt failed definitively. Review its abandoned GitHub branch or pull request, then explicitly retry as a new governed attempt.",
      409,
      false
    );
  }
  if (
    latest?.status === "FAILED" &&
    input.allowFailedRetry &&
    latest.id !== input.expectedFailedIntentId
  ) {
    throw new FlowcordiaRollbackError(
      "rollback_retry_required",
      "The failed rollback attempt changed during retry inspection. Retry again to inspect the latest attempt safely.",
      409,
      false
    );
  }
  if (!latest && input.allowFailedRetry) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "There is no failed rollback attempt to retry.",
      409,
      false
    );
  }
  const attemptNumber = (latest?.attemptNumber ?? 0) + 1;
  if (attemptNumber > MAX_ROLLBACK_ATTEMPTS) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The rollback attempt limit has been reached.",
      409,
      false
    );
  }
  const targetProposalId = flowcordiaRollbackProposalId({
    rollbackKey: input.rollbackKey,
    attemptNumber,
  });

  try {
    const created = await database.flowcordiaRollbackIntent.create({
      data: {
        organizationId: input.scope.tenantId,
        projectId: input.scope.projectId,
        githubAppInstallationId: input.scope.githubAppInstallationId,
        appInstallationId,
        repositoryId: input.scope.repositoryId,
        repositoryGithubId: githubRepositoryId,
        workflowId: input.workflowId,
        rollbackKey: input.rollbackKey,
        attemptNumber,
        sourceProposalId: input.sourceProposalId,
        sourceHeadSha: input.sourceHeadSha,
        sourceMergeCommitSha: input.sourceMergeCommitSha,
        currentProposalId: input.currentProposalId,
        currentHeadSha: input.currentHeadSha,
        currentMergeCommitSha: input.currentMergeCommitSha,
        baseCommitSha: input.baseCommitSha,
        baseBlobSha: input.baseBlobSha,
        targetProposalId,
        reason: input.reason,
        createdByUserId: input.actorId,
        creatorReviewerId: input.creatorReviewerId,
        correlationId: input.correlationId,
      },
      select: selectIntent,
    });
    return present(created, false);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await readByAttempt(
        {
          scope: input.scope,
          rollbackKey: input.rollbackKey,
          attemptNumber,
        },
        database
      );
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

export async function completeFlowcordiaRollbackIntent(
  input: {
    intentId: string;
    targetHeadSha: string;
    pullRequestNumber: number;
    sourcePatchCount: number;
    leaseToken: string;
  },
  database: RollbackIntentDatabase = prisma
): Promise<void> {
  if (
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.targetHeadSha) ||
    !Number.isSafeInteger(input.pullRequestNumber) ||
    input.pullRequestNumber < 1 ||
    !Number.isSafeInteger(input.sourcePatchCount) ||
    input.sourcePatchCount < 0 ||
    input.sourcePatchCount > MAX_GITHUB_SOURCE_PATCH_FILES ||
    !MUTATION_LEASE_TOKEN_PATTERN.test(input.leaseToken)
  ) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "Rollback proposal completion identity is invalid.",
      409,
      false
    );
  }
  const existing = await database.flowcordiaRollbackIntent.findUnique({
    where: { id: input.intentId },
    select: {
      status: true,
      targetHeadSha: true,
      pullRequestNumber: true,
      sourcePatchCount: true,
      mutationLeaseToken: true,
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
  if (existing.mutationLeaseToken !== input.leaseToken) {
    throw new FlowcordiaRollbackError(
      "proposal_reconciling",
      "The rollback mutation lease changed before provenance completion.",
      409,
      false
    );
  }

  const updated = await database.flowcordiaRollbackIntent.updateMany({
    where: {
      id: input.intentId,
      status: "PENDING",
      mutationLeaseToken: input.leaseToken,
    },
    data: {
      status: "PROPOSAL_CREATED",
      targetHeadSha: input.targetHeadSha,
      pullRequestNumber: input.pullRequestNumber,
      sourcePatchCount: input.sourcePatchCount,
      failureCode: null,
      failureMessage: null,
      mutationLeaseToken: null,
      mutationLeaseExpiresAt: null,
    },
  });
  if (updated.count === 1) return;

  const raced = await database.flowcordiaRollbackIntent.findUnique({
    where: { id: input.intentId },
    select: {
      status: true,
      targetHeadSha: true,
      pullRequestNumber: true,
      sourcePatchCount: true,
    },
  });
  if (
    raced?.status === "PROPOSAL_CREATED" &&
    raced.targetHeadSha === input.targetHeadSha &&
    raced.pullRequestNumber === input.pullRequestNumber &&
    raced.sourcePatchCount === input.sourcePatchCount
  ) {
    return;
  }
  throw new FlowcordiaRollbackError(
    "proposal_failed",
    "Rollback proposal provenance changed before completion.",
    409,
    false
  );
}

export async function recordFlowcordiaRollbackIntentFailure(
  input: {
    intentId: string;
    code: string;
    message: string;
    terminal: boolean;
    leaseToken: string;
  },
  database: RollbackIntentDatabase = prisma
): Promise<boolean> {
  if (!MUTATION_LEASE_TOKEN_PATTERN.test(input.leaseToken)) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "Rollback failure lease identity is invalid.",
      409,
      false
    );
  }
  const updated = await database.flowcordiaRollbackIntent.updateMany({
    where: {
      id: input.intentId,
      status: "PENDING",
      mutationLeaseToken: input.leaseToken,
    },
    data: {
      status: input.terminal ? "FAILED" : "PENDING",
      failureCode: input.code.slice(0, 128),
      failureMessage: input.message.slice(0, 1000),
      mutationLeaseToken: null,
      mutationLeaseExpiresAt: null,
    },
  });
  return updated.count === 1;
}

export async function retireFlowcordiaRollbackIntent(
  input: {
    intentId: string;
    code: string;
    message: string;
    now: Date;
    invalidateActiveLease: boolean;
  },
  database: RollbackIntentDatabase = prisma
): Promise<boolean> {
  if (Number.isNaN(input.now.getTime())) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "Rollback retirement time is invalid.",
      409,
      false
    );
  }
  const updated = await database.flowcordiaRollbackIntent.updateMany({
    where: {
      id: input.intentId,
      status: input.invalidateActiveLease ? { in: ["PENDING", "PROPOSAL_CREATED"] } : "PENDING",
      ...(input.invalidateActiveLease
        ? {}
        : {
            OR: [
              { mutationLeaseToken: null, mutationLeaseExpiresAt: null },
              { mutationLeaseExpiresAt: { lte: input.now } },
            ],
          }),
    },
    data: {
      status: "FAILED",
      failureCode: input.code.slice(0, 128),
      failureMessage: input.message.slice(0, 1000),
      mutationLeaseToken: null,
      mutationLeaseExpiresAt: null,
    },
  });
  return updated.count === 1;
}
