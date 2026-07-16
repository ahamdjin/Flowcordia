-- Flowcordia owns this PostgreSQL schema directly through a typed raw-SQL adapter.
-- Keeping it outside Prisma's inherited public schema prevents accidental coupling to
-- Trigger.dev models while retaining database-enforced tenant and repository identity.
CREATE SCHEMA IF NOT EXISTS "flowcordia";

CREATE TABLE "flowcordia"."workflow_index_sync" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "github_app_installation_id" TEXT NOT NULL,
    "app_installation_id" BIGINT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "repository_github_id" BIGINT NOT NULL,
    "repository_owner" TEXT NOT NULL,
    "repository_name" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requested_commit_sha" TEXT,
    "observed_commit_sha" TEXT,
    "generation" BIGINT NOT NULL DEFAULT 1,
    "entry_count" INTEGER NOT NULL DEFAULT 0,
    "valid_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "locked_by" TEXT,
    "lock_token" TEXT,
    "lock_expires_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_index_sync_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_index_sync_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'IDLE', 'FAILED')),
    CONSTRAINT "workflow_index_sync_reason_check" CHECK (char_length("reason") BETWEEN 1 AND 100),
    CONSTRAINT "workflow_index_sync_branch_check" CHECK (char_length("branch") BETWEEN 1 AND 255),
    CONSTRAINT "workflow_index_sync_requested_sha_check" CHECK ("requested_commit_sha" IS NULL OR "requested_commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
    CONSTRAINT "workflow_index_sync_observed_sha_check" CHECK ("observed_commit_sha" IS NULL OR "observed_commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
    CONSTRAINT "workflow_index_sync_counts_check" CHECK ("entry_count" >= 0 AND "valid_count" >= 0 AND "invalid_count" >= 0 AND "entry_count" = "valid_count" + "invalid_count")
);

CREATE UNIQUE INDEX "workflow_index_sync_project_repository_key"
    ON "flowcordia"."workflow_index_sync"("project_id", "repository_id");
CREATE INDEX "workflow_index_sync_claim_idx"
    ON "flowcordia"."workflow_index_sync"("requested_at", "lock_expires_at")
    WHERE "status" IN ('PENDING', 'RUNNING');
CREATE INDEX "workflow_index_sync_lease_idx"
    ON "flowcordia"."workflow_index_sync"("lock_expires_at")
    WHERE "lock_expires_at" IS NOT NULL;
CREATE INDEX "workflow_index_sync_scope_idx"
    ON "flowcordia"."workflow_index_sync"("organization_id", "project_id", "repository_id");

CREATE TABLE "flowcordia"."workflow_index_entry" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "github_app_installation_id" TEXT NOT NULL,
    "app_installation_id" BIGINT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "repository_github_id" BIGINT NOT NULL,
    "repository_owner" TEXT NOT NULL,
    "repository_name" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_path" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "schema_version" TEXT,
    "node_count" INTEGER,
    "edge_count" INTEGER,
    "source_commit_sha" TEXT NOT NULL,
    "source_blob_sha" TEXT NOT NULL,
    "canonical_sha256" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "indexed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_index_entry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_index_entry_status_check" CHECK ("status" IN ('VALID', 'INVALID')),
    CONSTRAINT "workflow_index_entry_id_check" CHECK ("workflow_id" ~ '^[a-z][a-z0-9_-]{2,127}$'),
    CONSTRAINT "workflow_index_entry_path_check" CHECK (char_length("workflow_path") BETWEEN 1 AND 512 AND "workflow_path" !~ '(^/|(^|/)\.\.(/|$))'),
    CONSTRAINT "workflow_index_entry_commit_sha_check" CHECK ("source_commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
    CONSTRAINT "workflow_index_entry_blob_sha_check" CHECK ("source_blob_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
    CONSTRAINT "workflow_index_entry_canonical_sha_check" CHECK ("canonical_sha256" IS NULL OR "canonical_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "workflow_index_entry_counts_check" CHECK (("status" = 'VALID' AND "name" IS NOT NULL AND "schema_version" IS NOT NULL AND "node_count" >= 0 AND "edge_count" >= 0 AND "canonical_sha256" IS NOT NULL AND "failure_code" IS NULL AND "failure_message" IS NULL) OR ("status" = 'INVALID' AND "failure_code" IS NOT NULL AND "failure_message" IS NOT NULL))
);

CREATE UNIQUE INDEX "workflow_index_entry_project_repository_path_key"
    ON "flowcordia"."workflow_index_entry"("project_id", "repository_id", "workflow_path");
CREATE UNIQUE INDEX "workflow_index_entry_project_repository_workflow_key"
    ON "flowcordia"."workflow_index_entry"("project_id", "repository_id", "workflow_id");
CREATE INDEX "workflow_index_entry_scope_updated_idx"
    ON "flowcordia"."workflow_index_entry"("organization_id", "project_id", "repository_id", "updated_at" DESC);
CREATE INDEX "workflow_index_entry_status_idx"
    ON "flowcordia"."workflow_index_entry"("project_id", "repository_id", "status", "workflow_id");
CREATE INDEX "workflow_index_entry_commit_idx"
    ON "flowcordia"."workflow_index_entry"("repository_id", "source_commit_sha");

CREATE TABLE "flowcordia"."workflow_index_audit_event" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_index_audit_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_index_audit_event_type_check" CHECK (char_length("event_type") BETWEEN 1 AND 100),
    CONSTRAINT "workflow_index_audit_event_actor_check" CHECK (char_length("actor_id") BETWEEN 1 AND 255),
    CONSTRAINT "workflow_index_audit_event_correlation_check" CHECK (char_length("correlation_id") BETWEEN 1 AND 255)
);

CREATE UNIQUE INDEX "workflow_index_audit_event_dedupe_key"
    ON "flowcordia"."workflow_index_audit_event"("dedupe_key");
CREATE INDEX "workflow_index_audit_event_scope_time_idx"
    ON "flowcordia"."workflow_index_audit_event"("organization_id", "project_id", "repository_id", "occurred_at" DESC);
CREATE INDEX "workflow_index_audit_event_correlation_idx"
    ON "flowcordia"."workflow_index_audit_event"("correlation_id");

CREATE TABLE "flowcordia"."workflow_index_webhook_delivery" (
    "delivery_id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "app_installation_id" BIGINT NOT NULL,
    "repository_github_id" BIGINT NOT NULL,
    "ref" TEXT,
    "after_sha" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "failure_code" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_index_webhook_delivery_pkey" PRIMARY KEY ("delivery_id"),
    CONSTRAINT "workflow_index_webhook_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "workflow_index_webhook_status_check" CHECK ("status" IN ('RECEIVED', 'SCHEDULED', 'IGNORED', 'FAILED')),
    CONSTRAINT "workflow_index_webhook_after_sha_check" CHECK ("after_sha" IS NULL OR "after_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$')
);

CREATE INDEX "workflow_index_webhook_repository_time_idx"
    ON "flowcordia"."workflow_index_webhook_delivery"("app_installation_id", "repository_github_id", "received_at" DESC);

ALTER TABLE "flowcordia"."workflow_index_sync"
    ADD CONSTRAINT "workflow_index_sync_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_index_sync_project_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_index_sync_installation_fkey" FOREIGN KEY ("github_app_installation_id") REFERENCES "public"."GithubAppInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_index_sync_repository_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flowcordia"."workflow_index_entry"
    ADD CONSTRAINT "workflow_index_entry_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_index_entry_project_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_index_entry_installation_fkey" FOREIGN KEY ("github_app_installation_id") REFERENCES "public"."GithubAppInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_index_entry_repository_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flowcordia"."workflow_index_audit_event"
    ADD CONSTRAINT "workflow_index_audit_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_index_audit_project_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_index_audit_repository_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
