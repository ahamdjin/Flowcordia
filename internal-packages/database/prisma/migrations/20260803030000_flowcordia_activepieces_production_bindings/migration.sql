CREATE TABLE "FlowcordiaActivepiecesProductionBinding" (
    "id" TEXT NOT NULL,
    "releasePublicId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runtimeEnvironmentId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "scheduleTaskId" TEXT NOT NULL,
    "pieceName" TEXT NOT NULL,
    "pieceVersion" TEXT NOT NULL,
    "triggerName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "propertySettings" JSONB NOT NULL,
    "triggerType" TEXT,
    "webhookUrl" TEXT,
    "appWebhookUrl" TEXT,
    "handshakeConfiguration" JSONB,
    "renewConfiguration" JSONB,
    "scheduleFriendlyId" TEXT,
    "scheduleKind" TEXT,
    "status" TEXT NOT NULL,
    "failureMessage" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaActivepiecesProductionBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowcordiaActivepiecesProductionBinding_releasePublicId_key"
ON "FlowcordiaActivepiecesProductionBinding"("releasePublicId");

CREATE INDEX "FlowcordiaActivepiecesProductionBinding_environment_workflow_status_idx"
ON "FlowcordiaActivepiecesProductionBinding"("runtimeEnvironmentId", "workflowId", "status");

CREATE INDEX "FlowcordiaActivepiecesProductionBinding_environment_schedule_status_idx"
ON "FlowcordiaActivepiecesProductionBinding"("runtimeEnvironmentId", "scheduleTaskId", "status");

CREATE TABLE "FlowcordiaActivepiecesProductionAppEventListener" (
    "id" TEXT NOT NULL,
    "releasePublicId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runtimeEnvironmentId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "pieceName" TEXT NOT NULL,
    "pieceVersion" TEXT NOT NULL,
    "triggerName" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "identifierValue" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowcordiaActivepiecesProductionAppEventListener_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowcordiaActivepiecesProductionAppEventListener_release_event_identifier_key"
ON "FlowcordiaActivepiecesProductionAppEventListener"("releasePublicId", "event", "identifierValue");

CREATE INDEX "FlowcordiaActivepiecesProductionAppEventListener_lookup_idx"
ON "FlowcordiaActivepiecesProductionAppEventListener"("pieceName", "event", "identifierValue");
