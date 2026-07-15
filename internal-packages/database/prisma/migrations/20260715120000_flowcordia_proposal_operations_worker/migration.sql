-- Add an operator-visible reconciliation timestamp without placing lease data on the public aggregate.
ALTER TABLE "FlowcordiaWorkflowProposal"
ADD COLUMN "lastReconciledAt" TIMESTAMP(3);

-- Reconciliation has its own durable schedule so worker identity and lock tokens cannot leak
-- through proposal API responses. The proposal foreign key also gives tenant data cascade cleanup.
CREATE TABLE "FlowcordiaProposalReconciliation" (
    "proposalStorageId" TEXT NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "lockToken" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaProposalReconciliation_pkey" PRIMARY KEY ("proposalStorageId")
);

CREATE INDEX "FlowcordiaProposalReconciliation_availableAt_idx"
ON "FlowcordiaProposalReconciliation"("availableAt");

CREATE INDEX "FlowcordiaProposalReconciliation_lockExpiresAt_idx"
ON "FlowcordiaProposalReconciliation"("lockExpiresAt");

ALTER TABLE "FlowcordiaProposalReconciliation"
ADD CONSTRAINT "FlowcordiaProposalReconciliation_proposalStorageId_fkey"
FOREIGN KEY ("proposalStorageId") REFERENCES "FlowcordiaWorkflowProposal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- One-time backfill. New proposal writes create their schedule transactionally,
-- avoiding a repository-wide scan in every worker polling cycle.
INSERT INTO "FlowcordiaProposalReconciliation" (
    "proposalStorageId",
    "availableAt",
    "attempts",
    "createdAt",
    "updatedAt"
)
SELECT
    proposal."id",
    proposal."updatedAt",
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "FlowcordiaWorkflowProposal" AS proposal
WHERE proposal."state" IN ('CREATING', 'DRAFT', 'READY', 'PROMOTING', 'RECONCILING')
ON CONFLICT ("proposalStorageId") DO NOTHING;
