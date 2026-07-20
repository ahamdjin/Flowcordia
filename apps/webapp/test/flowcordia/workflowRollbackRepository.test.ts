import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";

const database = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }));

vi.mock("~/db.server", () => ({
  prisma: {
    flowcordiaWorkflowProposal: {
      findFirst: database.findFirst,
      findMany: database.findMany,
    },
  },
}));

import {
  findFlowcordiaRollbackAttempt,
  findFlowcordiaRollbackTarget,
  queryFlowcordiaRollbackHistory,
} from "../../app/features/flowcordia/workflows/rollback/repository.server";

const scope = {
  tenantId: "org-1",
  projectId: "project-1",
  githubAppInstallationId: "github-installation-1",
  installationId: 100,
  repositoryId: "repository-1",
  repositoryGithubId: "200",
  repository: { owner: "acme", name: "workflow-repo", branch: "production" },
} satisfies WorkflowIndexScope;
const workflowId = "lead_intake";
const proposalId = "proposal-1";

const exactScope = {
  organizationId: scope.tenantId,
  projectId: scope.projectId,
  githubAppInstallationId: scope.githubAppInstallationId,
  appInstallationId: BigInt(scope.installationId),
  repositoryId: scope.repositoryId,
  repositoryGithubId: BigInt(scope.repositoryGithubId),
  repositoryOwner: scope.repository.owner,
  repositoryName: scope.repository.name,
  baseBranch: scope.repository.branch,
};

beforeEach(() => {
  database.findFirst.mockReset();
  database.findMany.mockReset();
});

describe("Flowcordia rollback repository scope", () => {
  it("binds history to the exact installation, repository coordinates, and production branch", async () => {
    const current = {
      proposalId: "proposal-current",
      headSha: "1".repeat(40),
      mergeCommitSha: "2".repeat(40),
      pullRequestNumber: 42,
    };
    database.findFirst.mockResolvedValue(current);
    database.findMany.mockResolvedValue([]);

    await queryFlowcordiaRollbackHistory({
      scope,
      workflowId,
      currentWorkflowSha256: "3".repeat(64),
    });

    expect(database.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...exactScope,
          workflowId,
          state: "MERGED",
          desiredWorkflowSha256: "3".repeat(64),
        }),
      })
    );
    expect(database.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...exactScope,
          workflowId,
          state: "MERGED",
          proposalId: { not: current.proposalId },
        }),
      })
    );
  });

  it("binds a rollback target to the same exact repository scope", async () => {
    database.findFirst.mockResolvedValue(null);

    await findFlowcordiaRollbackTarget({ scope, workflowId, proposalId });

    expect(database.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...exactScope,
          workflowId,
          proposalId,
          state: "MERGED",
        }),
      })
    );
  });

  it("binds rollback-attempt observation to the same exact repository scope", async () => {
    const attemptProposalId = `rollback-${"9".repeat(64)}-a1`;
    database.findFirst.mockResolvedValue(null);

    await findFlowcordiaRollbackAttempt({ scope, workflowId, proposalId: attemptProposalId });

    expect(database.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...exactScope,
          workflowId,
          proposalId: attemptProposalId,
        },
      })
    );
  });
});
