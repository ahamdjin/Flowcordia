ALTER TABLE "FlowcordiaWebhookEndpoint"
ADD COLUMN "revokedByUserId" TEXT,
ADD COLUMN "revocationReason" TEXT;

-- Preserve legacy revoked rows, if any, before enforcing complete audit metadata.
UPDATE "FlowcordiaWebhookEndpoint"
SET
  "revokedByUserId" = 'system_legacy',
  "revocationReason" = 'manual_emergency_stop'
WHERE "revokedAt" IS NOT NULL;

ALTER TABLE "FlowcordiaWebhookEndpoint"
ADD CONSTRAINT "FlowcordiaWebhookEndpoint_revocation_audit_check"
CHECK (
  (
    "revokedAt" IS NULL
    AND "revokedByUserId" IS NULL
    AND "revocationReason" IS NULL
  )
  OR
  (
    "revokedAt" IS NOT NULL
    AND "revokedByUserId" IS NOT NULL
    AND "revocationReason" IN (
      'credential_compromise',
      'unexpected_traffic',
      'workflow_retired',
      'manual_emergency_stop'
    )
  )
);

CREATE INDEX "FlowcordiaWebhookEndpoint_project_revoked_idx"
ON "FlowcordiaWebhookEndpoint"("projectId", "revokedAt" DESC);
