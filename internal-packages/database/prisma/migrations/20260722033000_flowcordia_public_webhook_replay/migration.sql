-- CreateEnum
CREATE TYPE "FlowcordiaPublicWebhookDeliveryStatus" AS ENUM ('RECEIVED', 'TRIGGERED', 'FAILED');

-- CreateTable
CREATE TABLE "FlowcordiaPublicWebhookDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runtimeEnvironmentId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "FlowcordiaPublicWebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "runFriendlyId" TEXT,
    "failureCode" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaPublicWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaPublicWebhookDelivery_scope_key"
ON "FlowcordiaPublicWebhookDelivery"("runtimeEnvironmentId", "workflowId", "deliveryId");

-- CreateIndex
CREATE INDEX "FlowcordiaPublicWebhookDelivery_project_workflow_received_idx"
ON "FlowcordiaPublicWebhookDelivery"("projectId", "workflowId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "FlowcordiaPublicWebhookDelivery_status_lease_idx"
ON "FlowcordiaPublicWebhookDelivery"("status", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "FlowcordiaPublicWebhookDelivery"
ADD CONSTRAINT "FlowcordiaPublicWebhookDelivery_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowcordiaPublicWebhookDelivery"
ADD CONSTRAINT "FlowcordiaPublicWebhookDelivery_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowcordiaPublicWebhookDelivery"
ADD CONSTRAINT "FlowcordiaPublicWebhookDelivery_runtimeEnvironmentId_fkey"
FOREIGN KEY ("runtimeEnvironmentId") REFERENCES "RuntimeEnvironment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
