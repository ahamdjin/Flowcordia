CREATE TYPE "FlowcordiaApprovalNotificationStage" AS ENUM ('REMINDER', 'ESCALATION');
CREATE TYPE "FlowcordiaApprovalNotificationStatus" AS ENUM ('PENDING', 'DELIVERING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE "FlowcordiaApprovalNotificationDelivery" (
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
  "reminderAt" TIMESTAMP(3),
  "escalationAt" TIMESTAMP(3),
  "timeoutAt" TIMESTAMP(3) NOT NULL,
  "stage" "FlowcordiaApprovalNotificationStage" NOT NULL,
  "channelId" TEXT NOT NULL,
  "channelType" "ProjectAlertChannelType" NOT NULL,
  "status" "FlowcordiaApprovalNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "sentAt" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlowcordiaApprovalNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowcordiaApprovalNotificationDelivery_scope_key"
  ON "FlowcordiaApprovalNotificationDelivery"("waitpointId", "stage", "channelId");
CREATE INDEX "FlowcordiaApprovalNotificationDelivery_due_idx"
  ON "FlowcordiaApprovalNotificationDelivery"("status", "availableAt");
CREATE INDEX "FlowcordiaApprovalNotificationDelivery_lease_idx"
  ON "FlowcordiaApprovalNotificationDelivery"("status", "leaseExpiresAt");
CREATE INDEX "FlowcordiaApprovalNotificationDelivery_project_created_idx"
  ON "FlowcordiaApprovalNotificationDelivery"("projectId", "createdAt" DESC);
CREATE INDEX "FlowcordiaApprovalNotificationDelivery_waitpoint_idx"
  ON "FlowcordiaApprovalNotificationDelivery"("waitpointId", "createdAt" DESC);
