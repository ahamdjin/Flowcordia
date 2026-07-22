-- Extend the replay ledger with stable endpoint ownership.
ALTER TABLE "FlowcordiaPublicWebhookDelivery"
ADD COLUMN "webhookEndpointId" TEXT NOT NULL DEFAULT '';

-- Existing rows predate public endpoint activation. Keep their legacy empty
-- endpoint marker while requiring all new application writes to provide one.
ALTER TABLE "FlowcordiaPublicWebhookDelivery"
ALTER COLUMN "webhookEndpointId" DROP DEFAULT;

DROP INDEX "FlowcordiaPublicWebhookDelivery_scope_key";

CREATE UNIQUE INDEX "FlowcordiaPublicWebhookDelivery_scope_key"
ON "FlowcordiaPublicWebhookDelivery"(
  "runtimeEnvironmentId",
  "workflowId",
  "webhookEndpointId",
  "deliveryId"
);

CREATE INDEX "FlowcordiaPublicWebhookDelivery_endpoint_received_idx"
ON "FlowcordiaPublicWebhookDelivery"("webhookEndpointId", "receivedAt" DESC);
