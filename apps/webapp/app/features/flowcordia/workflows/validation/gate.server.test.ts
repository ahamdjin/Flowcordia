import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowcordiaFunctionValidationProjection } from "./presentation";

const mocks = vi.hoisted(() => ({
  listProposals: vi.fn(),
  queryValidation: vi.fn(),
}));

vi.mock("../../proposals/prisma.server", () => ({
  flowcordiaProposalStore: { listProposals: mocks.listProposals },
}));
vi.mock("./query.server", () => ({
  queryFlowcordiaFunctionValidation: mocks.queryValidation,
}));

import {
  FlowcordiaFunctionValidationGateError,
  flowcordiaFunctionValidationAllowsPromotion,
  requireFlowcordiaFunctionValidationForPromotion,
} from "./gate.server";

const scope = {
  tenantId: "org-1",
  projectId: "project-1",
  installationId: 100,
  repositoryId: "repository-1",
  repositoryGithubId: "200",
  repository: { owner: "acme", name: "workflow-repo", branch: "main" },
  githubAppInstallationId: "installation-row-1",
};
const proposal = {
  proposalId: "studio-s-validation",
  workflowId: "lead_intake",
  headSha: "a".repeat(40),
};

function validation(
  state: FlowcordiaFunctionValidationProjection["state"]
): FlowcordiaFunctionValidationProjection {
  return {
    state,
    message: `Validation is ${state}.`,
    proposal: {
      proposalId: proposal.proposalId,
      headSha: proposal.headSha,
      pullRequestNumber: 21,
    },
    suite: null,
    latestRun: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listProposals.mockResolvedValue([proposal]);
});

describe("Flowcordia function validation promotion gate", () => {
  it("allows only passed or not-required exact-head validation", () => {
    expect(flowcordiaFunctionValidationAllowsPromotion(validation("PASSED"))).toBe(true);
    expect(flowcordiaFunctionValidationAllowsPromotion(validation("NOT_REQUIRED"))).toBe(true);
    expect(flowcordiaFunctionValidationAllowsPromotion(validation("READY_TO_RUN"))).toBe(false);
    expect(flowcordiaFunctionValidationAllowsPromotion(validation("FAILED"))).toBe(false);
  });

  it("returns the exact passed validation evidence", async () => {
    const passed = validation("PASSED");
    mocks.queryValidation.mockResolvedValue(passed);

    await expect(
      requireFlowcordiaFunctionValidationForPromotion({
        scope,
        proposalId: proposal.proposalId,
        expectedHeadSha: proposal.headSha,
      })
    ).resolves.toBe(passed);
    expect(mocks.queryValidation).toHaveBeenCalledWith({
      scope,
      workflowId: proposal.workflowId,
      expectedProposalId: proposal.proposalId,
      expectedHeadSha: proposal.headSha,
    });
  });

  it("blocks failed validation before proposal promotion", async () => {
    mocks.queryValidation.mockResolvedValue(validation("FAILED"));

    await expect(
      requireFlowcordiaFunctionValidationForPromotion({
        scope,
        proposalId: proposal.proposalId,
        expectedHeadSha: proposal.headSha,
      })
    ).rejects.toMatchObject({
      code: "function_validation_required",
      state: "FAILED",
      status: 409,
      retryable: true,
    } satisfies Partial<FlowcordiaFunctionValidationGateError>);
  });

  it("rejects a proposal head that no longer matches durable truth", async () => {
    mocks.listProposals.mockResolvedValue([]);

    await expect(
      requireFlowcordiaFunctionValidationForPromotion({
        scope,
        proposalId: proposal.proposalId,
        expectedHeadSha: proposal.headSha,
      })
    ).rejects.toMatchObject({
      state: "BLOCKED",
      status: 409,
      retryable: false,
    });
    expect(mocks.queryValidation).not.toHaveBeenCalled();
  });
});
