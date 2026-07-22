ALTER TABLE "FlowcordiaWebhookEndpoint"
ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "supersededAt" TIMESTAMP(3),
ADD COLUMN "replacesEndpointId" TEXT,
ADD COLUMN "replacementCreatedByUserId" TEXT;

ALTER TABLE "FlowcordiaWebhookEndpoint"
ADD CONSTRAINT "FlowcordiaWebhookEndpoint_generation_check"
CHECK ("generation" >= 1);

ALTER TABLE "FlowcordiaWebhookEndpoint"
ADD CONSTRAINT "FlowcordiaWebhookEndpoint_replacement_audit_check"
CHECK (
  (
    "generation" = 1
    AND "replacesEndpointId" IS NULL
    AND "replacementCreatedByUserId" IS NULL
  )
  OR
  (
    "generation" > 1
    AND "replacesEndpointId" IS NOT NULL
    AND "replacementCreatedByUserId" IS NOT NULL
  )
);

DROP INDEX "FlowcordiaWebhookEndpoint_environment_workflow_node_key";

CREATE UNIQUE INDEX "FlowcordiaWebhookEndpoint_env_workflow_node_gen_key"
ON "FlowcordiaWebhookEndpoint"(
  "runtimeEnvironmentId",
  "workflowId",
  "nodeId",
  "generation"
);

-- Prisma cannot express a partial unique index. This is the authoritative
-- invariant that permits immutable history while allowing only one current
-- public identity for a production workflow trigger.
CREATE UNIQUE INDEX "FlowcordiaWebhookEndpoint_current_scope_key"
ON "FlowcordiaWebhookEndpoint"(
  "runtimeEnvironmentId",
  "workflowId",
  "nodeId"
)
WHERE "supersededAt" IS NULL;

CREATE UNIQUE INDEX "FlowcordiaWebhookEndpoint_replaces_endpoint_key"
ON "FlowcordiaWebhookEndpoint"("replacesEndpointId")
WHERE "replacesEndpointId" IS NOT NULL;

CREATE INDEX "FlowcordiaWebhookEndpoint_project_workflow_superseded_idx"
ON "FlowcordiaWebhookEndpoint"("projectId", "workflowId", "supersededAt");

ALTER TABLE "FlowcordiaWebhookEndpoint"
ADD CONSTRAINT "FlowcordiaWebhookEndpoint_replacesEndpointId_fkey"
FOREIGN KEY ("replacesEndpointId")
REFERENCES "FlowcordiaWebhookEndpoint"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
