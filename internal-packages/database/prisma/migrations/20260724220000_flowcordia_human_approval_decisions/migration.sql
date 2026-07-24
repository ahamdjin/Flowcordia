CREATE TYPE "FlowcordiaApprovalDecisionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "FlowcordiaApprovalDecisionValue" AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE "FlowcordiaApprovalDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runtimeEnvironmentId" TEXT NOT NULL,
    "waitpointId" TEXT NOT NULL,
    "waitpointFriendlyId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "runFriendlyId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "requireComment" BOOLEAN NOT NULL,
    "timeoutAt" TIMESTAMP(3) NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "FlowcordiaApprovalDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "decision" "FlowcordiaApprovalDecisionValue" NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "decidedByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaApprovalDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowcordiaApprovalDecision_waitpointId_key"
ON "FlowcordiaApprovalDecision"("waitpointId");
CREATE INDEX "FlowcordiaApprovalDecision_env_created_idx"
ON "FlowcordiaApprovalDecision"("projectId", "runtimeEnvironmentId", "createdAt" DESC);
CREATE INDEX "FlowcordiaApprovalDecision_request_idx"
ON "FlowcordiaApprovalDecision"("runtimeEnvironmentId", "requestId");

ALTER TABLE "FlowcordiaApprovalDecision"
ADD CONSTRAINT "FlowcordiaApprovalDecision_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowcordiaApprovalDecision"
ADD CONSTRAINT "FlowcordiaApprovalDecision_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowcordiaApprovalDecision"
ADD CONSTRAINT "FlowcordiaApprovalDecision_runtimeEnvironmentId_fkey"
FOREIGN KEY ("runtimeEnvironmentId") REFERENCES "RuntimeEnvironment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowcordiaApprovalDecision"
ADD CONSTRAINT "FlowcordiaApprovalDecision_waitpointId_fkey"
FOREIGN KEY ("waitpointId") REFERENCES "Waitpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
