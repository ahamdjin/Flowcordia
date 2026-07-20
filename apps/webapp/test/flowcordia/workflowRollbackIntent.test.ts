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
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  };
});

vi.mock("~/db.server", () => ({
  Prisma: { PrismaClientKnownRequestError: database.KnownRequestError },
  prisma: {
    flowcordiaRollbackIntent: {
      findUnique: database.findUnique,
      findFirst: database.findFirst,
      create: database.create,
      updateMany: database.updateMany,
    },
  },
}));

import {
  claimFlowcordiaRollbackMutation,
  completeFlowcordiaRollbackIntent,
  recordFlowcordiaRollbackIntentFailure,
  renewFlowcordiaRollbackMutation,
  reserveFlowcordiaRollbackIntent,
  retireFlowcordiaRollbackIntent,
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
  rollbackKey: "9".repeat(64),
  sourceProposalId: "proposal_previous",
  sourceHeadSha: "1".repeat(40),
  sourceMergeCommitSha: "2".repeat(40),
  currentProposalId: "proposal_current",
  currentHeadSha: "3".repeat(40),
  currentMergeCommitSha: "4".repeat(40),
  baseCommitSha: "5".repeat(40),
  baseBlobSha: "6".repeat(40),
  reason: "Restore the last reviewed version after a production regression.",
  actorId: "user_123",
  creatorReviewerId: "reviewer_123",
  correlationId: "rollback:request_123",
};

const leaseToken = "11111111-1111-4111-8111-111111111111";

function stored(
  overrides: Partial<{
    status: "PENDING" | "PROPOSAL_CREATED" | "FAILED";
    reason: string;
    targetHeadSha: string | null;
    pullRequestNumber: number | null;
    sourcePatchCount: number | null;
    mutationLeaseToken: string | null;
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
    rollbackKey: identity.rollbackKey,
    attemptNumber: 1,
    sourceProposalId: identity.sourceProposalId,
    sourceHeadSha: identity.sourceHeadSha,
    sourceMergeCommitSha: identity.sourceMergeCommitSha,
    currentProposalId: identity.currentProposalId,
    currentHeadSha: identity.currentHeadSha,
    currentMergeCommitSha: identity.currentMergeCommitSha,
    baseCommitSha: identity.baseCommitSha,
    baseBlobSha: identity.baseBlobSha,
    targetProposalId: `rollback-${identity.rollbackKey}-a1`,
    reason: overrides.reason ?? identity.reason,
    creatorReviewerId: identity.creatorReviewerId,
    status: overrides.status ?? "PENDING",
    targetHeadSha: overrides.targetHeadSha ?? null,
    pullRequestNumber: overrides.pullRequestNumber ?? null,
    sourcePatchCount: overrides.sourcePatchCount ?? null,
    mutationLeaseToken: overrides.mutationLeaseToken ?? leaseToken,
    mutationLeaseExpiresAt: new Date("2026-07-20T23:05:00.000Z"),
  };
}

beforeEach(() => {
  database.findUnique.mockReset();
  database.findFirst.mockReset();
  database.create.mockReset();
  database.updateMany.mockReset();
});

describe("Flowcordia rollback intent reservation", () => {
  it("reuses an exact pending intent without issuing another create", async () => {
    database.findFirst.mockResolvedValue(stored());

    await expect(
      reserveFlowcordiaRollbackIntent({
        ...identity,
        allowFailedRetry: false,
        expectedFailedIntentId: null,
      })
    ).resolves.toEqual({
      id: "intent_123",
      status: "PENDING",
      resumed: true,
      rollbackKey: identity.rollbackKey,
      attemptNumber: 1,
      targetProposalId: `rollback-${identity.rollbackKey}-a1`,
      targetHeadSha: null,
      pullRequestNumber: null,
      sourcePatchCount: null,
      creatorReviewerId: identity.creatorReviewerId,
    });
    expect(database.create).not.toHaveBeenCalled();
  });

  it("reconciles a P2002 reservation race by re-reading exact provenance", async () => {
    database.findFirst.mockResolvedValue(null);
    database.findUnique.mockResolvedValue(stored());
    database.create.mockRejectedValue(new database.KnownRequestError("P2002"));

    await expect(
      reserveFlowcordiaRollbackIntent({
        ...identity,
        allowFailedRetry: false,
        expectedFailedIntentId: null,
      })
    ).resolves.toMatchObject({
      id: "intent_123",
      status: "PENDING",
      resumed: true,
    });
    expect(database.findFirst).toHaveBeenCalledTimes(1);
    expect(database.findUnique).toHaveBeenCalledTimes(1);
  });

  it("rejects an existing target identity bound to different immutable provenance", async () => {
    database.findFirst.mockResolvedValue({
      ...stored(),
      baseBlobSha: "8".repeat(40),
    });

    await expect(
      reserveFlowcordiaRollbackIntent({
        ...identity,
        allowFailedRetry: false,
        expectedFailedIntentId: null,
      })
    ).rejects.toMatchObject<Partial<FlowcordiaRollbackError>>({
      code: "rollback_conflict",
      status: 409,
      retryable: false,
    });
  });

  it("does not reuse an intent that ended in a definitive failure", async () => {
    database.findFirst.mockResolvedValue(stored({ status: "FAILED" }));

    await expect(
      reserveFlowcordiaRollbackIntent({
        ...identity,
        allowFailedRetry: false,
        expectedFailedIntentId: null,
      })
    ).rejects.toMatchObject<Partial<FlowcordiaRollbackError>>({
      code: "rollback_retry_required",
      status: 409,
      retryable: false,
    });
  });

  it("allocates the next deterministic attempt only after explicit retry", async () => {
    database.findFirst.mockResolvedValue(stored({ status: "FAILED" }));
    database.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...stored(),
      attemptNumber: data.attemptNumber,
      targetProposalId: data.targetProposalId,
    }));

    await expect(
      reserveFlowcordiaRollbackIntent({
        ...identity,
        allowFailedRetry: true,
        expectedFailedIntentId: "intent_123",
      })
    ).resolves.toMatchObject({
      rollbackKey: identity.rollbackKey,
      attemptNumber: 2,
      targetProposalId: `rollback-${identity.rollbackKey}-a2`,
      status: "PENDING",
      resumed: false,
    });
    expect(database.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rollbackKey: identity.rollbackKey,
          attemptNumber: 2,
          targetProposalId: `rollback-${identity.rollbackKey}-a2`,
        }),
      })
    );
  });

  it("does not allocate from a failed attempt different from the one inspected", async () => {
    database.findFirst.mockResolvedValue({
      ...stored({ status: "FAILED" }),
      id: "intent_newer",
      attemptNumber: 2,
      targetProposalId: `rollback-${identity.rollbackKey}-a2`,
    });

    await expect(
      reserveFlowcordiaRollbackIntent({
        ...identity,
        allowFailedRetry: true,
        expectedFailedIntentId: "intent_123",
      })
    ).rejects.toMatchObject<Partial<FlowcordiaRollbackError>>({
      code: "rollback_retry_required",
      status: 409,
      retryable: false,
    });
    expect(database.create).not.toHaveBeenCalled();
  });
});

describe("Flowcordia rollback intent completion", () => {
  const result = {
    intentId: "intent_123",
    targetHeadSha: "7".repeat(40),
    pullRequestNumber: 84,
    sourcePatchCount: 2,
    leaseToken,
  };

  it("completes one pending intent with an optimistic state guard", async () => {
    database.findUnique.mockResolvedValue(stored());
    database.updateMany.mockResolvedValue({ count: 1 });

    await expect(completeFlowcordiaRollbackIntent(result)).resolves.toBeUndefined();
    expect(database.updateMany).toHaveBeenCalledWith({
      where: { id: result.intentId, status: "PENDING", mutationLeaseToken: leaseToken },
      data: {
        status: "PROPOSAL_CREATED",
        targetHeadSha: result.targetHeadSha,
        pullRequestNumber: result.pullRequestNumber,
        sourcePatchCount: result.sourcePatchCount,
        failureCode: null,
        failureMessage: null,
        mutationLeaseToken: null,
        mutationLeaseExpiresAt: null,
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

  it("resumes a pending attempt without requiring the original reason to be re-entered", async () => {
    database.findFirst.mockResolvedValue(stored({ reason: "The original operator reason." }));

    await expect(
      reserveFlowcordiaRollbackIntent({
        ...identity,
        reason: "A teammate resumed after a process crash.",
        allowFailedRetry: false,
        expectedFailedIntentId: null,
      })
    ).resolves.toMatchObject({ id: "intent_123", status: "PENDING" });
    expect(database.create).not.toHaveBeenCalled();
  });

  it("reuses the original creator reviewer when another teammate resumes", async () => {
    database.findFirst.mockResolvedValue(stored());

    await expect(
      reserveFlowcordiaRollbackIntent({
        ...identity,
        actorId: "user_456",
        creatorReviewerId: "reviewer_456",
        allowFailedRetry: false,
        expectedFailedIntentId: null,
      })
    ).resolves.toMatchObject({ creatorReviewerId: "reviewer_123" });
    expect(database.create).not.toHaveBeenCalled();
  });

  it("fails when pending provenance changes before the guarded update", async () => {
    database.findUnique.mockResolvedValueOnce(stored()).mockResolvedValueOnce(null);
    database.updateMany.mockResolvedValue({ count: 0 });

    await expect(completeFlowcordiaRollbackIntent(result)).rejects.toMatchObject<
      Partial<FlowcordiaRollbackError>
    >({ code: "proposal_failed", status: 409, retryable: false });
  });

  it("accepts an identical completion that wins the guarded update race", async () => {
    database.findUnique.mockResolvedValueOnce(stored()).mockResolvedValueOnce(
      stored({
        status: "PROPOSAL_CREATED",
        targetHeadSha: result.targetHeadSha,
        pullRequestNumber: result.pullRequestNumber,
        sourcePatchCount: result.sourcePatchCount,
      })
    );
    database.updateMany.mockResolvedValue({ count: 0 });

    await expect(completeFlowcordiaRollbackIntent(result)).resolves.toBeUndefined();
    expect(database.findUnique).toHaveBeenCalledTimes(2);
  });

  it.each([null, "not-a-uuid"])(
    "rejects an invalid completion lease token before reading the database",
    async (invalidLeaseToken) => {
      await expect(
        completeFlowcordiaRollbackIntent({
          ...result,
          leaseToken: invalidLeaseToken,
        } as never)
      ).rejects.toMatchObject<Partial<FlowcordiaRollbackError>>({
        code: "rollback_conflict",
        status: 409,
        retryable: false,
      });
      expect(database.findUnique).not.toHaveBeenCalled();
      expect(database.updateMany).not.toHaveBeenCalled();
    }
  );
});

describe("Flowcordia rollback intent failure recording", () => {
  it("keeps retryable failures pending and bounds stored diagnostics", async () => {
    database.updateMany.mockResolvedValue({ count: 1 });
    const message = "x".repeat(2_000);

    await recordFlowcordiaRollbackIntentFailure({
      intentId: "intent_123",
      code: "provider_temporarily_unavailable".repeat(10),
      message,
      terminal: false,
      leaseToken,
    });

    expect(database.updateMany).toHaveBeenCalledWith({
      where: { id: "intent_123", status: "PENDING", mutationLeaseToken: leaseToken },
      data: {
        status: "PENDING",
        failureCode: expect.stringMatching(/^.{128}$/s),
        failureMessage: "x".repeat(1_000),
        mutationLeaseToken: null,
        mutationLeaseExpiresAt: null,
      },
    });
  });

  it("marks definitive failures terminal without changing completed intents", async () => {
    database.updateMany.mockResolvedValue({ count: 1 });

    await recordFlowcordiaRollbackIntentFailure({
      intentId: "intent_123",
      code: "invalid_historical_snapshot",
      message: "The historical snapshot is invalid.",
      terminal: true,
      leaseToken,
    });

    expect(database.updateMany).toHaveBeenCalledWith({
      where: { id: "intent_123", status: "PENDING", mutationLeaseToken: leaseToken },
      data: {
        status: "FAILED",
        failureCode: "invalid_historical_snapshot",
        failureMessage: "The historical snapshot is invalid.",
        mutationLeaseToken: null,
        mutationLeaseExpiresAt: null,
      },
    });
  });

  it("retires a completed intent when its governed proposal later becomes terminal", async () => {
    database.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2026-07-20T23:00:00.000Z");

    await expect(
      retireFlowcordiaRollbackIntent({
        intentId: "intent_123",
        code: "proposal_failed",
        message: "The governed proposal later failed reconciliation.",
        now,
        invalidateActiveLease: true,
      })
    ).resolves.toBe(true);

    expect(database.updateMany).toHaveBeenCalledWith({
      where: {
        id: "intent_123",
        status: { in: ["PENDING", "PROPOSAL_CREATED"] },
      },
      data: {
        status: "FAILED",
        failureCode: "proposal_failed",
        failureMessage: "The governed proposal later failed reconciliation.",
        mutationLeaseToken: null,
        mutationLeaseExpiresAt: null,
      },
    });
  });

  it("does not retire an intent claimed during inactive-lease reconciliation", async () => {
    database.updateMany.mockResolvedValue({ count: 0 });
    const now = new Date("2026-07-20T23:00:00.000Z");

    await expect(
      retireFlowcordiaRollbackIntent({
        intentId: "intent_123",
        code: "proposal_missing",
        message: "The proposal was not found after the observed lease expiry.",
        now,
        invalidateActiveLease: false,
      })
    ).resolves.toBe(false);

    expect(database.updateMany).toHaveBeenCalledWith({
      where: {
        id: "intent_123",
        status: "PENDING",
        OR: [
          { mutationLeaseToken: null, mutationLeaseExpiresAt: null },
          { mutationLeaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: "FAILED",
        failureCode: "proposal_missing",
        failureMessage: "The proposal was not found after the observed lease expiry.",
        mutationLeaseToken: null,
        mutationLeaseExpiresAt: null,
      },
    });
  });
});

describe("Flowcordia rollback mutation lease", () => {
  const now = new Date("2026-07-20T23:00:00.000Z");
  const leaseExpiresAt = new Date("2026-07-20T23:05:00.000Z");

  it("claims only an unowned or expired pending intent", async () => {
    database.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      claimFlowcordiaRollbackMutation({
        intentId: "intent_123",
        leaseToken,
        now,
        leaseExpiresAt,
      })
    ).resolves.toBe(true);
    expect(database.updateMany).toHaveBeenCalledWith({
      where: {
        id: "intent_123",
        status: "PENDING",
        OR: [
          { mutationLeaseToken: null, mutationLeaseExpiresAt: null },
          { mutationLeaseExpiresAt: { lt: now } },
        ],
      },
      data: { mutationLeaseToken: leaseToken, mutationLeaseExpiresAt: leaseExpiresAt },
    });
  });

  it("renews only the current unexpired fenced lease", async () => {
    database.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      renewFlowcordiaRollbackMutation({
        intentId: "intent_123",
        leaseToken,
        now,
        leaseExpiresAt,
      })
    ).resolves.toBe(true);
    expect(database.updateMany).toHaveBeenCalledWith({
      where: {
        id: "intent_123",
        status: "PENDING",
        mutationLeaseToken: leaseToken,
        mutationLeaseExpiresAt: { gte: now },
      },
      data: { mutationLeaseExpiresAt: leaseExpiresAt },
    });
  });
});
