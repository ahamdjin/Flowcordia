CREATE TABLE "FlowcordiaActivepiecesStepFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runtimeEnvironmentId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaActivepiecesStepFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FlowcordiaActivepiecesStepFile_environment_workflow_idx"
ON "FlowcordiaActivepiecesStepFile"("runtimeEnvironmentId", "workflowId");

CREATE INDEX "FlowcordiaActivepiecesStepFile_expiry_idx"
ON "FlowcordiaActivepiecesStepFile"("expiresAt");
