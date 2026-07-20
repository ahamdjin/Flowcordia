-- AddColumn
ALTER TABLE "FlowcordiaRollbackIntent"
ADD COLUMN "rollbackKey" TEXT,
ADD COLUMN "attemptNumber" INTEGER,
ADD COLUMN "creatorReviewerId" TEXT,
ADD COLUMN "mutationLeaseToken" TEXT,
ADD COLUMN "mutationLeaseExpiresAt" TIMESTAMP(3);

-- Retire any intent created by the pre-fencing draft. Its legacy proposal
-- identity cannot be resumed safely under the numbered-attempt contract.
UPDATE "FlowcordiaRollbackIntent"
SET
    "rollbackKey" = md5("id") || md5('flowcordia:' || "id"),
    "attemptNumber" = 1,
    "status" = 'FAILED',
    "targetHeadSha" = NULL,
    "pullRequestNumber" = NULL,
    "sourcePatchCount" = NULL,
    "failureCode" = 'legacy_intent_retired',
    "failureMessage" = 'This pre-fencing rollback intent was retired during the governed rollback upgrade.',
    "mutationLeaseToken" = NULL,
    "mutationLeaseExpiresAt" = NULL;

-- Make the deterministic retry identity mandatory after legacy rows are retired.
ALTER TABLE "FlowcordiaRollbackIntent"
ALTER COLUMN "rollbackKey" SET NOT NULL,
ALTER COLUMN "attemptNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaRollbackIntent_repo_rollback_attempt_key"
ON "FlowcordiaRollbackIntent"("repositoryId", "rollbackKey", "attemptNumber");

-- AddConstraint
ALTER TABLE "FlowcordiaRollbackIntent"
ADD CONSTRAINT "FlowcordiaRollbackIntent_rollbackKey_check"
CHECK ("rollbackKey" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "FlowcordiaRollbackIntent_attemptNumber_check"
CHECK ("attemptNumber" BETWEEN 1 AND 99999),
ADD CONSTRAINT "FlowcordiaRollbackIntent_sha_check"
CHECK (
    "sourceHeadSha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'
    AND "sourceMergeCommitSha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'
    AND "currentHeadSha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'
    AND "currentMergeCommitSha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'
    AND "baseCommitSha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'
    AND "baseBlobSha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'
    AND ("targetHeadSha" IS NULL OR "targetHeadSha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$')
),
ADD CONSTRAINT "FlowcordiaRollbackIntent_result_bounds_check"
CHECK (
    ("pullRequestNumber" IS NULL OR "pullRequestNumber" > 0)
    AND ("sourcePatchCount" IS NULL OR "sourcePatchCount" BETWEEN 0 AND 32)
),
ADD CONSTRAINT "FlowcordiaRollbackIntent_result_state_check"
CHECK (
    (
        "status" = 'PENDING'
        AND "targetHeadSha" IS NULL
        AND "pullRequestNumber" IS NULL
        AND "sourcePatchCount" IS NULL
    )
    OR (
        "status" = 'PROPOSAL_CREATED'
        AND "targetHeadSha" IS NOT NULL
        AND "pullRequestNumber" IS NOT NULL
        AND "sourcePatchCount" IS NOT NULL
    )
    OR (
        "status" = 'FAILED'
        AND (
            (
                "targetHeadSha" IS NULL
                AND "pullRequestNumber" IS NULL
                AND "sourcePatchCount" IS NULL
            )
            OR (
                "targetHeadSha" IS NOT NULL
                AND "pullRequestNumber" IS NOT NULL
                AND "sourcePatchCount" IS NOT NULL
            )
        )
    )
),
ADD CONSTRAINT "FlowcordiaRollbackIntent_failure_state_check"
CHECK (
    ("failureCode" IS NULL AND "failureMessage" IS NULL)
    OR (
        "failureCode" IS NOT NULL
        AND "failureMessage" IS NOT NULL
        AND "status" IN ('PENDING', 'FAILED')
    )
),
ADD CONSTRAINT "FlowcordiaRollbackIntent_mutationLease_check"
CHECK (
    (
        "mutationLeaseToken" IS NULL
        AND "mutationLeaseExpiresAt" IS NULL
    )
    OR (
        "status" = 'PENDING'
        AND "mutationLeaseToken" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND "mutationLeaseExpiresAt" IS NOT NULL
    )
);
