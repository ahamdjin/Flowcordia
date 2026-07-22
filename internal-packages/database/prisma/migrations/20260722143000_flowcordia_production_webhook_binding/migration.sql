-- CreateTable
CREATE TABLE "FlowcordiaWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runtimeEnvironmentId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "activeRevisionId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowcordiaWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowcordiaWebhookRevision" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "mergeCommitSha" TEXT NOT NULL,
    "workflowPath" TEXT NOT NULL,
    "workflowBlobSha" TEXT NOT NULL,
    "workflowCanonicalSha256" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "deploymentShortCode" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "workerVersion" TEXT NOT NULL,
    "taskIdentifier" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "maxBodyBytes" INTEGER NOT NULL,
    "timestampToleranceSeconds" INTEGER NOT NULL,
    "credentialReference" TEXT NOT NULL,
    "credentialEnvironmentName" TEXT NOT NULL,
    "credentialVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowcordiaWebhookRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaWebhookEndpoint_publicId_key" ON "FlowcordiaWebhookEndpoint"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaWebhookEndpoint_activeRevisionId_key" ON "FlowcordiaWebhookEndpoint"("activeRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaWebhookEndpoint_environment_workflow_node_key" ON "FlowcordiaWebhookEndpoint"("runtimeEnvironmentId", "workflowId", "nodeId");

-- CreateIndex
CREATE INDEX "FlowcordiaWebhookEndpoint_project_workflow_idx" ON "FlowcordiaWebhookEndpoint"("projectId", "workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaWebhookRevision_endpoint_revision_key" ON "FlowcordiaWebhookRevision"("endpointId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "FlowcordiaWebhookRevision_endpoint_fingerprint_key" ON "FlowcordiaWebhookRevision"("endpointId", "fingerprint");

-- CreateIndex
CREATE INDEX "FlowcordiaWebhookRevision_commit_idx" ON "FlowcordiaWebhookRevision"("mergeCommitSha");

-- AddForeignKey
ALTER TABLE "FlowcordiaWebhookEndpoint" ADD CONSTRAINT "FlowcordiaWebhookEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowcordiaWebhookEndpoint" ADD CONSTRAINT "FlowcordiaWebhookEndpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowcordiaWebhookEndpoint" ADD CONSTRAINT "FlowcordiaWebhookEndpoint_runtimeEnvironmentId_fkey" FOREIGN KEY ("runtimeEnvironmentId") REFERENCES "RuntimeEnvironment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowcordiaWebhookRevision" ADD CONSTRAINT "FlowcordiaWebhookRevision_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "FlowcordiaWebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowcordiaWebhookEndpoint" ADD CONSTRAINT "FlowcordiaWebhookEndpoint_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "FlowcordiaWebhookRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
