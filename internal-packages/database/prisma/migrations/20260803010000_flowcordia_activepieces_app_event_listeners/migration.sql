CREATE TABLE "FlowcordiaActivepiecesAppEventListener" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runtimeEnvironmentId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT,
    "pieceName" TEXT NOT NULL,
    "pieceVersion" TEXT NOT NULL,
    "triggerName" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "identifierValue" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "simulationId" TEXT,
    "simulationRunId" TEXT,
    "createdByUserId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaActivepiecesAppEventListener_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowcordiaActivepiecesAppEventListener_simulation_event_key"
ON "FlowcordiaActivepiecesAppEventListener"("simulationId", "event", "identifierValue");

CREATE INDEX "FlowcordiaActivepiecesAppEventListener_lookup_idx"
ON "FlowcordiaActivepiecesAppEventListener"("pieceName", "event", "identifierValue", "mode");

CREATE INDEX "FlowcordiaActivepiecesAppEventListener_environment_workflow_idx"
ON "FlowcordiaActivepiecesAppEventListener"("runtimeEnvironmentId", "workflowId");

CREATE INDEX "FlowcordiaActivepiecesAppEventListener_expiry_idx"
ON "FlowcordiaActivepiecesAppEventListener"("expiresAt");
