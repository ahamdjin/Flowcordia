import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";

const database = vi.hoisted(() => ({ findIntent: vi.fn(), findProposal: vi.fn() }));

vi.mock("~/db.server", () => ({
  prisma: {
    flowcordiaRollbackIntent: { findFirst: database.findIntent },
    flowcordiaWorkflowProposal: { findFirst: database.findProposal },
  },
}));

import {
  FlowcordiaRollbackProposalGateError,
  requireVerifiedFlowcordiaRollbackProposal,
} from "../../app/features/flowcordia/workflows/rollback/proposal-gate.server";

const scope = {
  tenantId: "org-1",
  projectId: "project-1",
  githubAppInstallationId: "github-installation-1",
  installationId: 100,
  repositoryId: "repository-1",
  repositoryGithubId: "200",
  repository: { owner: "acme", name: "workflow-repo", branch: "main" },
} satisfies WorkflowIndexScope;
const proposalId = `rollback-${"9".repeat(64)}-a1`;
const expectedHeadSha = "8".repeat(40);

beforeEach(() => {
  database.findIntent.mockReset();
  database.findProposal.mockReset();
  database.findProposal.mockResolvedValue({ state: "DRAFT", headSha: expectedHeadSha });
});

describe("Flowcordia rollback proposal lifecycle gate", () => {
  it("does not affect ordinary governed proposals", async () => {
    database.findIntent.mockResolvedValue(null);
    await expect(
      requireVerifiedFlowcordiaRollbackProposal({
        scope,
        proposalId: "proposal-normal",
        expectedHeadSha,
      })
    ).resolves.toBeUndefined();
    expect(database.findProposal).not.toHaveBeenCalled();
  });

  it("allows a rollback only after exact-head verification completed", async () => {
    database.findIntent.mockResolvedValue({
      status: "PROPOSAL_CREATED",
      targetHeadSha: expectedHeadSha,
    });
    await expect(
      requireVerifiedFlowcordiaRollbackProposal({ scope, proposalId, expectedHeadSha })
    ).resolves.toBeUndefined();
  });

  it.each([
    { status: "PENDING", targetHeadSha: null },
    { status: "FAILED", targetHeadSha: null },
  ])("blocks an unverified rollback lifecycle transition", async (intent) => {
    database.findIntent.mockResolvedValue(intent);
    await expect(
      requireVerifiedFlowcordiaRollbackProposal({ scope, proposalId, expectedHeadSha })
    ).rejects.toMatchObject<Partial<FlowcordiaRollbackProposalGateError>>({
      code: "rollback_verification_required",
      status: 409,
      retryable: false,
    });
  });

  it("requires cleanup instead of refresh when a verified rollback head changed", async () => {
    database.findIntent.mockResolvedValue({
      status: "PROPOSAL_CREATED",
      targetHeadSha: "7".repeat(40),
    });
    await expect(
      requireVerifiedFlowcordiaRollbackProposal({ scope, proposalId, expectedHeadSha })
    ).rejects.toThrow(/changed after exact-head verification.*Close it without merging/);
  });

  it("fails closed when the durable proposal head differs from the verified intent", async () => {
    database.findIntent.mockResolvedValue({
      status: "PROPOSAL_CREATED",
      targetHeadSha: expectedHeadSha,
    });
    database.findProposal.mockResolvedValue({ state: "MERGED", headSha: "7".repeat(40) });

    await expect(
      requireVerifiedFlowcordiaRollbackProposal({ scope, proposalId, expectedHeadSha })
    ).rejects.toThrow(/changed after exact-head verification.*Close it without merging/);
    expect(database.findProposal).toHaveBeenCalledWith({
      where: {
        organizationId: scope.tenantId,
        projectId: scope.projectId,
        githubAppInstallationId: scope.githubAppInstallationId,
        appInstallationId: BigInt(scope.installationId),
        repositoryId: scope.repositoryId,
        repositoryGithubId: BigInt(scope.repositoryGithubId),
        repositoryOwner: scope.repository.owner,
        repositoryName: scope.repository.name,
        baseBranch: scope.repository.branch,
        proposalId,
      },
      select: { state: true, headSha: true },
    });
  });

  it.each([null, { state: "FAILED", headSha: expectedHeadSha }])(
    "blocks a missing or terminal durable rollback proposal",
    async (proposal) => {
      database.findIntent.mockResolvedValue({
        status: "PROPOSAL_CREATED",
        targetHeadSha: expectedHeadSha,
      });
      database.findProposal.mockResolvedValue(proposal);

      await expect(
        requireVerifiedFlowcordiaRollbackProposal({ scope, proposalId, expectedHeadSha })
      ).rejects.toMatchObject<Partial<FlowcordiaRollbackProposalGateError>>({
        code: "rollback_verification_required",
        status: 409,
        retryable: false,
      });
    }
  );
});
