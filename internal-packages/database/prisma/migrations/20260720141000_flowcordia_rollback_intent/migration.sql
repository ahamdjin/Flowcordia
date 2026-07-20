-- CreateEnum
CREATE TYPE "FlowcordiaRollbackIntentStatus" AS ENUM ('PENDING', 'PROPOSAL_CREATED', 'FAILED');

-- CreateTable
CREATE TABLE "FlowcordiaRollbackIntent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "githubAppInstallationId" TEXT NOT NULL,
    "appInstallationId" BIGINT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "repositoryGithubId" BIGINT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "sourceProposalId" TEXT NOT NULL,
    "sourceHeadSha" TEXT NOT NULL,
    "sourceMergeCommitSha" TEXT NOT NULL,
    "currentProposalId" TEXT NOT NULL,
    "currentHeadSha" TEXT NOT NULL,
    "currentMergeCommitSha" TEXT NOT NULL,
    "baseCommitSha" TEXT NOT NULL,
    "baseBlobSha" TEXT NOT NULL,
    "targetProposalId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "status" "FlowcordiaRollbackIntentStatus" NOT NULL DEFAULT 'PENDING',
    "targetHeadSha" TEXT,
    "pullRequestNumber" INTEGER,
    "sourcePatchCount" INTEGER,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaRollbackIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaRollbackIntent_repositoryId_targetProposalId_key" ON "FlowcordiaRollbackIntent"("repositoryId", "targetProposalId");

-- CreateIndex
CREATE INDEX "FlowcordiaRollbackIntent_organizationId_createdAt_idx" ON "FlowcordiaRollbackIntent"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FlowcordiaRollbackIntent_projectId_workflowId_createdAt_idx" ON "FlowcordiaRollbackIntent"("projectId", "workflowId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FlowcordiaRollbackIntent_repositoryId_sourceProposalId_idx" ON "FlowcordiaRollbackIntent"("repositoryId", "sourceProposalId");

-- AddForeignKey
ALTER TABLE "FlowcordiaRollbackIntent" ADD CONSTRAINT "FlowcordiaRollbackIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowcordiaRollbackIntent" ADD CONSTRAINT "FlowcordiaRollbackIntent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowcordiaRollbackIntent" ADD CONSTRAINT "FlowcordiaRollbackIntent_githubAppInstallationId_fkey" FOREIGN KEY ("githubAppInstallationId") REFERENCES "GithubAppInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowcordiaRollbackIntent" ADD CONSTRAINT "FlowcordiaRollbackIntent_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
