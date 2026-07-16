-- Flowcordia Studio drafts are durable application state, not Git history.
-- They remain isolated in the Flowcordia-owned schema and bind every row to the
-- authorized organization, project, installation, repository, and production branch.
CREATE TABLE "flowcordia"."workflow_draft" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
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
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "base_commit_sha" TEXT NOT NULL,
    "base_blob_sha" TEXT NOT NULL,
    "base_canonical_sha256" TEXT NOT NULL,
    "document_json" JSONB NOT NULL,
    "document_sha256" TEXT NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_by_actor_id" TEXT NOT NULL,
    "updated_by_actor_id" TEXT NOT NULL,
    "discarded_by_actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discarded_at" TIMESTAMP(3),

    CONSTRAINT "workflow_draft_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_draft_public_id_key" UNIQUE ("public_id"),
    CONSTRAINT "workflow_draft_status_check" CHECK ("status" IN ('ACTIVE', 'DISCARDED')),
    CONSTRAINT "workflow_draft_public_id_check" CHECK ("public_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
    CONSTRAINT "workflow_draft_workflow_id_check" CHECK ("workflow_id" ~ '^[a-z][a-z0-9_-]{2,127}$'),
    CONSTRAINT "workflow_draft_path_check" CHECK (char_length("workflow_path") BETWEEN 1 AND 512 AND "workflow_path" !~ '(^/|(^|/)\.\.(/|$))'),
    CONSTRAINT "workflow_draft_branch_check" CHECK (char_length("branch") BETWEEN 1 AND 255),
    CONSTRAINT "workflow_draft_base_commit_check" CHECK ("base_commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
    CONSTRAINT "workflow_draft_base_blob_check" CHECK ("base_blob_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
    CONSTRAINT "workflow_draft_base_canonical_check" CHECK ("base_canonical_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "workflow_draft_document_hash_check" CHECK ("document_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "workflow_draft_document_object_check" CHECK (jsonb_typeof("document_json") = 'object'),
    CONSTRAINT "workflow_draft_version_check" CHECK ("version" >= 1),
    CONSTRAINT "workflow_draft_actor_check" CHECK (char_length("created_by_actor_id") BETWEEN 1 AND 255 AND char_length("updated_by_actor_id") BETWEEN 1 AND 255),
    CONSTRAINT "workflow_draft_discard_check" CHECK (("status" = 'ACTIVE' AND "discarded_at" IS NULL AND "discarded_by_actor_id" IS NULL) OR ("status" = 'DISCARDED' AND "discarded_at" IS NOT NULL AND "discarded_by_actor_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "workflow_draft_active_workflow_key"
    ON "flowcordia"."workflow_draft"("project_id", "repository_id", "workflow_id")
    WHERE "status" = 'ACTIVE';
CREATE INDEX "workflow_draft_scope_updated_idx"
    ON "flowcordia"."workflow_draft"("organization_id", "project_id", "repository_id", "updated_at" DESC);
CREATE INDEX "workflow_draft_base_commit_idx"
    ON "flowcordia"."workflow_draft"("repository_id", "base_commit_sha");

CREATE TABLE "flowcordia"."workflow_draft_audit_event" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
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

    CONSTRAINT "workflow_draft_audit_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_draft_audit_event_dedupe_key" UNIQUE ("dedupe_key"),
    CONSTRAINT "workflow_draft_audit_event_type_check" CHECK (char_length("event_type") BETWEEN 1 AND 100),
    CONSTRAINT "workflow_draft_audit_event_actor_check" CHECK (char_length("actor_id") BETWEEN 1 AND 255),
    CONSTRAINT "workflow_draft_audit_event_correlation_check" CHECK (char_length("correlation_id") BETWEEN 1 AND 255),
    CONSTRAINT "workflow_draft_audit_event_payload_check" CHECK (jsonb_typeof("payload") = 'object')
);

CREATE INDEX "workflow_draft_audit_scope_time_idx"
    ON "flowcordia"."workflow_draft_audit_event"("organization_id", "project_id", "repository_id", "occurred_at" DESC);
CREATE INDEX "workflow_draft_audit_draft_time_idx"
    ON "flowcordia"."workflow_draft_audit_event"("draft_id", "occurred_at" DESC);
CREATE INDEX "workflow_draft_audit_correlation_idx"
    ON "flowcordia"."workflow_draft_audit_event"("correlation_id");

ALTER TABLE "flowcordia"."workflow_draft"
    ADD CONSTRAINT "workflow_draft_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_project_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_installation_fkey" FOREIGN KEY ("github_app_installation_id") REFERENCES "public"."GithubAppInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_repository_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flowcordia"."workflow_draft_audit_event"
    ADD CONSTRAINT "workflow_draft_audit_draft_fkey" FOREIGN KEY ("draft_id") REFERENCES "flowcordia"."workflow_draft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_audit_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_audit_project_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_audit_repository_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
