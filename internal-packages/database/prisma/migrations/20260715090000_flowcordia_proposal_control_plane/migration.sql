-- CreateEnum
CREATE TYPE "public"."FlowcordiaProposalState" AS ENUM ('CREATING', 'DRAFT', 'READY', 'PROMOTING', 'MERGED', 'CLOSED', 'RECONCILING', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."FlowcordiaProposalOperation" AS ENUM ('create', 'submit', 'promote');

-- CreateEnum
CREATE TYPE "public"."FlowcordiaGithubWebhookDeliveryStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."FlowcordiaWorkflowProposal" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workflowPath" TEXT NOT NULL,
    "desiredWorkflowSha256" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "githubAppInstallationId" TEXT NOT NULL,
    "appInstallationId" BIGINT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "repositoryGithubId" BIGINT NOT NULL,
    "repositoryOwner" TEXT NOT NULL,
    "repositoryName" TEXT NOT NULL,
    "baseBranch" TEXT NOT NULL,
    "baseCommitSha" TEXT NOT NULL,
    "expectedBaseBlobSha" TEXT,
    "proposalBranch" TEXT NOT NULL,
    "creatorReviewerId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "state" "public"."FlowcordiaProposalState" NOT NULL,
    "operation" "public"."FlowcordiaProposalOperation" NOT NULL,
    "headSha" TEXT,
    "pullRequestNumber" INTEGER,
    "pullRequestUrl" TEXT,
    "pullRequestDraft" BOOLEAN,
    "pullRequestState" TEXT,
    "merged" BOOLEAN NOT NULL DEFAULT false,
    "mergeCommitSha" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "lastCorrelationId" TEXT NOT NULL,
    "lastGithubEventAt" TIMESTAMP(3),
    "lastPullRequestEventAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaWorkflowProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FlowcordiaProposalAuditEvent" (
    "id" TEXT NOT NULL,
    "proposalStorageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowcordiaProposalAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FlowcordiaOutboxEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "lockToken" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FlowcordiaGithubWebhookDelivery" (
    "deliveryId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "action" TEXT,
    "appInstallationId" BIGINT NOT NULL,
    "repositoryGithubId" BIGINT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "normalizedPayload" JSONB NOT NULL,
    "status" "public"."FlowcordiaGithubWebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "proposalStorageId" TEXT,
    "failureCode" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowcordiaGithubWebhookDelivery_pkey" PRIMARY KEY ("deliveryId")
);

-- CreateIndex
CREATE INDEX "FlowcordiaWorkflowProposal_organizationId_updatedAt_idx" ON "public"."FlowcordiaWorkflowProposal"("organizationId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "FlowcordiaWorkflowProposal_projectId_state_updatedAt_idx" ON "public"."FlowcordiaWorkflowProposal"("projectId", "state", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "FlowcordiaWorkflowProposal_githubAppInstallationId_reposito_idx" ON "public"."FlowcordiaWorkflowProposal"("githubAppInstallationId", "repositoryId");

-- CreateIndex
CREATE INDEX "FlowcordiaWorkflowProposal_repositoryId_headSha_idx" ON "public"."FlowcordiaWorkflowProposal"("repositoryId", "headSha");

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaWorkflowProposal_repositoryId_proposalId_key" ON "public"."FlowcordiaWorkflowProposal"("repositoryId", "proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaWorkflowProposal_repositoryId_pullRequestNumber_key" ON "public"."FlowcordiaWorkflowProposal"("repositoryId", "pullRequestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaProposalAuditEvent_dedupeKey_key" ON "public"."FlowcordiaProposalAuditEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "FlowcordiaProposalAuditEvent_proposalStorageId_occurredAt_idx" ON "public"."FlowcordiaProposalAuditEvent"("proposalStorageId", "occurredAt");

-- CreateIndex
CREATE INDEX "FlowcordiaProposalAuditEvent_correlationId_idx" ON "public"."FlowcordiaProposalAuditEvent"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaOutboxEvent_dedupeKey_key" ON "public"."FlowcordiaOutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "FlowcordiaOutboxEvent_publishedAt_availableAt_idx" ON "public"."FlowcordiaOutboxEvent"("publishedAt", "availableAt");

-- CreateIndex
CREATE INDEX "FlowcordiaOutboxEvent_lockExpiresAt_idx" ON "public"."FlowcordiaOutboxEvent"("lockExpiresAt");

-- CreateIndex
CREATE INDEX "FlowcordiaOutboxEvent_organizationId_createdAt_idx" ON "public"."FlowcordiaOutboxEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "FlowcordiaGithubWebhookDelivery_appInstallationId_repositor_idx" ON "public"."FlowcordiaGithubWebhookDelivery"("appInstallationId", "repositoryGithubId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "FlowcordiaGithubWebhookDelivery_proposalStorageId_receivedA_idx" ON "public"."FlowcordiaGithubWebhookDelivery"("proposalStorageId", "receivedAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."FlowcordiaWorkflowProposal" ADD CONSTRAINT "FlowcordiaWorkflowProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FlowcordiaWorkflowProposal" ADD CONSTRAINT "FlowcordiaWorkflowProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FlowcordiaWorkflowProposal" ADD CONSTRAINT "FlowcordiaWorkflowProposal_githubAppInstallationId_fkey" FOREIGN KEY ("githubAppInstallationId") REFERENCES "public"."GithubAppInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FlowcordiaWorkflowProposal" ADD CONSTRAINT "FlowcordiaWorkflowProposal_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "public"."GithubRepository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FlowcordiaProposalAuditEvent" ADD CONSTRAINT "FlowcordiaProposalAuditEvent_proposalStorageId_fkey" FOREIGN KEY ("proposalStorageId") REFERENCES "public"."FlowcordiaWorkflowProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FlowcordiaOutboxEvent" ADD CONSTRAINT "FlowcordiaOutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FlowcordiaGithubWebhookDelivery" ADD CONSTRAINT "FlowcordiaGithubWebhookDelivery_proposalStorageId_fkey" FOREIGN KEY ("proposalStorageId") REFERENCES "public"."FlowcordiaWorkflowProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
