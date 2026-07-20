import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";

const database = vi.hoisted(() => {
  class KnownRequestError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.name = "PrismaClientKnownRequestError";
      this.code = code;
    }
  }

  return {
    KnownRequestError,
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  };
});

vi.mock("~/db.server", () => ({
  Prisma: { PrismaClientKnownRequestError: database.KnownRequestError },
  prisma: {
    flowcordiaRollbackIntent: {
      findUnique: database.findUnique,
      create: database.create,
      updateMany: database.updateMany,
    },
  },
}));

import {
  completeFlowcordiaRollbackIntent,
  recordFlowcordiaRollbackIntentFailure,
  reserveFlowcordiaRollbackIntent,
  type FlowcordiaRollbackIntentIdentity,
} from "../../app/features/flowcordia/workflows/rollback/intent.server";
import { FlowcordiaRollbackError } from "../../app/features/flowcordia/workflows/rollback/errors";

const scope = {
  tenantId: "org_123",
  projectId: "project_123",
  installationId: 42,
  githubAppInstallationId: "github_installation_123",
  repositoryId: "repository_123",
  repositoryGithubId: "987654321",
} as WorkflowIndexScope;

const identity: FlowcordiaRollbackIntentIdentity = {
  scope,
  workflowId: "reference_workflow",
  sourceProposalId: "proposal_previous",
  sourceHeadSha: "1".repeat(40),
  sourceMergeCommitSha: "2".repeat(40),
  currentProposalId: "proposal_current",
  currentHeadSha: "3".repeat(40),
  currentMergeCommitSha: "4".repeat(40),
  baseCommitSha: "5".repeat(40),
  baseBlobSha: "6".repeat(40),
  targetProposalId: "rollback_reference",
  reason: "Restore the last reviewed version after a production regression.",
  actorId: "user_123",
  correlationId: "rollback:request_123",
};

function stored(
  overrides: Partial<{
    status: "PENDING" | "PROPOSAL_CREATED" | "FAILED";
    reason: string;
    targetHeadSha: string | null;
    pullRequestNumber: number | null;
    sourcePatchCount: number | null;
  }> = {}
) {
  return {
    id: "intent_123",
    organizationId: scope.tenantId,
    projectId: scope.projectId,
    githubAppInstallationId: scope.githubAppInstallationId,
    appInstallationId: BigInt(scope.installationId),
    repositoryId: scope.repositoryId,
    repositoryGithubId: BigInt(scope.repositoryGithubId),
    workflowId: identity.workflowId,
    sourceProposalId: identity.sourceProposalId,
    sourceHeadSha: identity.sourceHeadSha,
    sourceMergeCommitSha: identity.sourceMergeCommitSha,
    currentProposalId: identity.currentProposalId,
    currentHeadSha: identity.currentHeadSha,
    currentMergeCommitSha: identity.currentMergeCommitSha,
    baseCommitSha: identity.baseCommitSha,
    baseBlobSha: identity.baseBlobSha,
    targetProposalId: identity.targetProposalId,
    reason: overrides.reason ?? identity.reason,
    status: overrides.status ?? "PENDING",
    targetHeadSha: overrides.targetHeadSha ?? null,
    pullRequestNumber: overrides.pullRequestNumber ?? null,
    sourcePatchCount: overrides.sourcePatchCount ?? null,
  };
}

beforeEach(() => {
  database.findUnique.mockReset();
  database.create.mockReset();
  database.updateMany.mockReset();
});

describe("Flowcordia rollback intent reservation", () => {
  it("reuses an exact pending intent without issuing another create", async () => {
    database.findUnique.mockResolvedValue(stored());

    await expect(reserveFlowcordiaRollbackIntent(identity)).resolves.toEqual({
      id: "intent_123",
      status: "PENDING",
      targetProposalId: identity.targetProposalId,
      targetHeadSha: null,
      pullRequestNumber: null,
      sourcePatchCount: null,
    });
    expect(database.create).not.toHaveBeenCalled();
  });

  it("reconciles a P2002 reservation race by re-reading exact provenance", async () => {
    database.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(stored());
    database.create.mockRejectedValue(new database.KnownRequestError("P2002"));

    await expect(reserveFlowcordiaRollbackIntent(identity)).resolves.toMatchObject({
      id: "intent_123",
      status: "PENDING",
    });
    expect(database.findUnique).toHaveBeenCalledTimes(2);
  });

  it("rejects an existing target identity bound to different immutable provenance", async () => {
    database.findUnique.mockResolvedValue(stored({ reason: "A different rollback reason." }));

    await expect(reserveFlowcordiaRollbackIntent(identity)).rejects.toMatchObject<
      Partial<FlowcordiaRollbackError>
    >({ code: "rollback_conflict", status: 409, retryable: false });
  });

  it("does not reuse an intent that ended in a definitive failure", async () => {
    database.findUnique.mockResolvedValue(stored({ status: "FAILED" }));

    await expect(reserveFlowcordiaRollbackIntent(identity)).rejects.toMatchObject<
      Partial<FlowcordiaRollbackError>
    >({ code: "proposal_failed", status: 409, retryable: false });
  });
});

describe("Flowcordia rollback intent completion", () => {
  const result = {
    intentId: "intent_123",
    targetHeadSha: "7".repeat(40),
    pullRequestNumber: 84,
    sourcePatchCount: 2,
  };

  it("completes one pending intent with an optimistic state guard", async () => {
    database.findUnique.mockResolvedValue(stored());
    database.updateMany.mockResolvedValue({ count: 1 });

    await expect(completeFlowcordiaRollbackIntent(result)).resolves.toBeUndefined();
    expect(database.updateMany).toHaveBeenCalledWith({
      where: { id: result.intentId, status: "PENDING" },
      data: {
        status: "PROPOSAL_CREATED",
        targetHeadSha: result.targetHeadSha,
        pullRequestNumber: result.pullRequestNumber,
        sourcePatchCount: result.sourcePatchCount,
        failureCode: null,
        failureMessage: null,
      },
    });
  });

  it("treats an identical completed result as idempotent", async () => {
    database.findUnique.mockResolvedValue(
      stored({
        status: "PROPOSAL_CREATED",
        targetHeadSha: result.targetHeadSha,
        pullRequestNumber: result.pullRequestNumber,
        sourcePatchCount: result.sourcePatchCount,
      })
    );

    await expect(completeFlowcordiaRollbackIntent(result)).resolves.toBeUndefined();
    expect(database.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an attempt to overwrite completed provenance", async () => {
    database.findUnique.mockResolvedValue(
      stored({
        status: "PROPOSAL_CREATED",
        targetHeadSha: "8".repeat(40),
        pullRequestNumber: 83,
        sourcePatchCount: 1,
      })
    );

    await expect(completeFlowcordiaRollbackIntent(result)).rejects.toMatchObject<
      Partial<FlowcordiaRollbackError>
    >({ code: "rollback_conflict", status: 409, retryable: false });
  });

  it("fails when pending provenance changes before the guarded update", async () => {
    database.findUnique.mockResolvedValue(stored());
    database.updateMany.mockResolvedValue({ count: 0 });

    await expect(completeFlowcordiaRollbackIntent(result)).rejects.toMatchObject<
      Partial<FlowcordiaRollbackError>
    >({ code: "proposal_failed", status: 409, retryable: false });
  });
});

describe("Flowcordia rollback intent failure recording", () => {
  it("keeps retryable failures pending and bounds stored diagnostics", async () => {
    database.updateMany.mockResolvedValue({ count: 1 });
    const message = "x".repeat(2_000);

    await recordFlowcordiaRollbackIntentFailure({
      intentId: "intent_123",
      code: "provider_temporarily_unavailable".repeat(10),
      message,
      retryable: true,
    });

    expect(database.updateMany).toHaveBeenCalledWith({
      where: { id: "intent_123", status: "PENDING" },
      data: {
        status: "PENDING",
        failureCode: expect.stringMatching(/^.{128}$/s),
        failureMessage: "x".repeat(1_000),
      },
    });
  });

  it("marks definitive failures terminal without changing completed intents", async () => {
    database.updateMany.mockResolvedValue({ count: 1 });

    await recordFlowcordiaRollbackIntentFailure({
      intentId: "intent_123",
      code: "invalid_historical_snapshot",
      message: "The historical snapshot is invalid.",
      retryable: false,
    });

    expect(database.updateMany).toHaveBeenCalledWith({
      where: { id: "intent_123", status: "PENDING" },
      data: {
        status: "FAILED",
        failureCode: "invalid_historical_snapshot",
        failureMessage: "The historical snapshot is invalid.",
      },
    });
  });
});
