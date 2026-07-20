import type { ControlPlaneScope } from "@flowcordia/control-plane";
import { isValidWorkflowId } from "@flowcordia/github-workflows";
import { prisma } from "~/db.server";
import type { FlowcordiaRollbackCandidate } from "./presentation";

const MAX_DATABASE_BIGINT = 9_223_372_036_854_775_807n;
const MAX_ROLLBACK_CANDIDATES = 10;

function installationId(value: number): bigint {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("Flowcordia rollback installation identity is invalid.");
  }
  return BigInt(value);
}

function repositoryGithubId(value: string): bigint {
  if (!/^[1-9][0-9]{0,18}$/.test(value)) {
    throw new TypeError("Flowcordia rollback repository identity is invalid.");
  }
  const parsed = BigInt(value);
  if (parsed > MAX_DATABASE_BIGINT) {
    throw new TypeError("Flowcordia rollback repository identity exceeds database bounds.");
  }
  return parsed;
}

function assertWorkflowId(value: string): void {
  if (!isValidWorkflowId(value)) {
    throw new TypeError("Flowcordia rollback workflow identity is invalid.");
  }
}

function assertWorkflowSha256(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError("Flowcordia rollback workflow digest is invalid.");
  }
}

function scopeWhere(scope: ControlPlaneScope) {
  return {
    organizationId: scope.tenantId,
    projectId: scope.projectId,
    appInstallationId: installationId(scope.installationId),
    repositoryId: scope.repositoryId,
    repositoryGithubId: repositoryGithubId(scope.repositoryGithubId),
  };
}

function present(row: {
  proposalId: string;
  headSha: string | null;
  mergeCommitSha: string | null;
  pullRequestNumber: number | null;
}): FlowcordiaRollbackCandidate | null {
  if (!row.headSha || !row.mergeCommitSha || row.pullRequestNumber === null) return null;
  return {
    proposalId: row.proposalId,
    headSha: row.headSha,
    mergeCommitSha: row.mergeCommitSha,
    pullRequestNumber: row.pullRequestNumber,
  };
}

const candidateSelect = {
  proposalId: true,
  headSha: true,
  mergeCommitSha: true,
  pullRequestNumber: true,
} as const;

export async function queryFlowcordiaRollbackHistory(input: {
  scope: ControlPlaneScope;
  workflowId: string;
  currentWorkflowSha256: string;
}): Promise<{
  current: FlowcordiaRollbackCandidate | null;
  candidates: FlowcordiaRollbackCandidate[];
}> {
  assertWorkflowId(input.workflowId);
  assertWorkflowSha256(input.currentWorkflowSha256);
  const where = {
    ...scopeWhere(input.scope),
    workflowId: input.workflowId,
    state: "MERGED" as const,
    headSha: { not: null },
    mergeCommitSha: { not: null },
    pullRequestNumber: { not: null },
  };
  const currentRow = await prisma.flowcordiaWorkflowProposal.findFirst({
    where: { ...where, desiredWorkflowSha256: input.currentWorkflowSha256 },
    orderBy: [{ pullRequestNumber: "desc" }, { id: "desc" }],
    select: candidateSelect,
  });
  const rows = await prisma.flowcordiaWorkflowProposal.findMany({
    where: {
      ...where,
      desiredWorkflowSha256: { not: input.currentWorkflowSha256 },
      ...(currentRow ? { proposalId: { not: currentRow.proposalId } } : {}),
    },
    orderBy: [{ pullRequestNumber: "desc" }, { id: "desc" }],
    take: MAX_ROLLBACK_CANDIDATES,
    select: candidateSelect,
  });
  return {
    current: currentRow ? present(currentRow) : null,
    candidates: rows
      .map(present)
      .filter((candidate): candidate is FlowcordiaRollbackCandidate => candidate !== null),
  };
}

export async function findFlowcordiaRollbackTarget(input: {
  scope: ControlPlaneScope;
  workflowId: string;
  proposalId: string;
}) {
  assertWorkflowId(input.workflowId);
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(input.proposalId)) {
    throw new TypeError("Flowcordia rollback proposal identity is invalid.");
  }
  return prisma.flowcordiaWorkflowProposal.findFirst({
    where: {
      ...scopeWhere(input.scope),
      workflowId: input.workflowId,
      proposalId: input.proposalId,
      state: "MERGED",
      headSha: { not: null },
      mergeCommitSha: { not: null },
      pullRequestNumber: { not: null },
    },
    select: {
      proposalId: true,
      workflowId: true,
      workflowPath: true,
      desiredWorkflowSha256: true,
      headSha: true,
      mergeCommitSha: true,
      pullRequestNumber: true,
    },
  });
}
