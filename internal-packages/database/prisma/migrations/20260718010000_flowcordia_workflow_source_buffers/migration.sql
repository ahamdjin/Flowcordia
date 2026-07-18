-- Repository source remains developer-owned Git state. Studio stores only bounded,
-- exact-base draft buffers that are deleted with their parent workflow draft.
CREATE TABLE "flowcordia"."workflow_draft_source_file" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "function_id" TEXT NOT NULL,
    "source_path" TEXT NOT NULL,
    "export_name" TEXT NOT NULL,
    "base_commit_sha" TEXT NOT NULL,
    "base_blob_sha" TEXT NOT NULL,
    "base_source_text" TEXT NOT NULL,
    "base_source_sha256" TEXT NOT NULL,
    "source_text" TEXT NOT NULL,
    "source_sha256" TEXT NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_by_actor_id" TEXT NOT NULL,
    "updated_by_actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_draft_source_file_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_draft_source_file_public_id_key" UNIQUE ("public_id"),
    CONSTRAINT "workflow_draft_source_file_draft_path_key" UNIQUE ("draft_id", "source_path"),
    CONSTRAINT "workflow_draft_source_file_public_id_check" CHECK ("public_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
    CONSTRAINT "workflow_draft_source_file_function_id_check" CHECK ("function_id" ~ '^[a-z][a-z0-9_-]{1,127}$'),
    CONSTRAINT "workflow_draft_source_file_path_check" CHECK (char_length("source_path") BETWEEN 1 AND 512 AND "source_path" !~ '(^/|(^|/)\.\.(/|$))' AND "source_path" !~ '\\'),
    CONSTRAINT "workflow_draft_source_file_export_check" CHECK ("export_name" ~ '^[A-Za-z_$][A-Za-z0-9_$]*$'),
    CONSTRAINT "workflow_draft_source_file_base_commit_check" CHECK ("base_commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
    CONSTRAINT "workflow_draft_source_file_base_blob_check" CHECK ("base_blob_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
    CONSTRAINT "workflow_draft_source_file_base_hash_check" CHECK ("base_source_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "workflow_draft_source_file_hash_check" CHECK ("source_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "workflow_draft_source_file_version_check" CHECK ("version" >= 1),
    CONSTRAINT "workflow_draft_source_file_actor_check" CHECK (char_length("created_by_actor_id") BETWEEN 1 AND 255 AND char_length("updated_by_actor_id") BETWEEN 1 AND 255)
);

CREATE INDEX "workflow_draft_source_file_draft_updated_idx"
    ON "flowcordia"."workflow_draft_source_file"("draft_id", "updated_at" DESC);
CREATE INDEX "workflow_draft_source_file_base_commit_idx"
    ON "flowcordia"."workflow_draft_source_file"("base_commit_sha");

CREATE TABLE "flowcordia"."workflow_draft_source_audit_event" (
    "id" TEXT NOT NULL,
    "source_file_id" TEXT NOT NULL,
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

    CONSTRAINT "workflow_draft_source_audit_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_draft_source_audit_event_dedupe_key" UNIQUE ("dedupe_key"),
    CONSTRAINT "workflow_draft_source_audit_event_type_check" CHECK (char_length("event_type") BETWEEN 1 AND 100),
    CONSTRAINT "workflow_draft_source_audit_event_actor_check" CHECK (char_length("actor_id") BETWEEN 1 AND 255),
    CONSTRAINT "workflow_draft_source_audit_event_correlation_check" CHECK (char_length("correlation_id") BETWEEN 1 AND 255),
    CONSTRAINT "workflow_draft_source_audit_event_payload_check" CHECK (jsonb_typeof("payload") = 'object')
);

CREATE INDEX "workflow_draft_source_audit_scope_time_idx"
    ON "flowcordia"."workflow_draft_source_audit_event"("organization_id", "project_id", "repository_id", "occurred_at" DESC);
CREATE INDEX "workflow_draft_source_audit_file_time_idx"
    ON "flowcordia"."workflow_draft_source_audit_event"("source_file_id", "occurred_at" DESC);
CREATE INDEX "workflow_draft_source_audit_correlation_idx"
    ON "flowcordia"."workflow_draft_source_audit_event"("correlation_id");

ALTER TABLE "flowcordia"."workflow_draft_source_file"
    ADD CONSTRAINT "workflow_draft_source_file_draft_fkey" FOREIGN KEY ("draft_id") REFERENCES "flowcordia"."workflow_draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flowcordia"."workflow_draft_source_audit_event"
    ADD CONSTRAINT "workflow_draft_source_audit_file_fkey" FOREIGN KEY ("source_file_id") REFERENCES "flowcordia"."workflow_draft_source_file"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_source_audit_draft_fkey" FOREIGN KEY ("draft_id") REFERENCES "flowcordia"."workflow_draft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_source_audit_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_source_audit_project_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "workflow_draft_source_audit_repository_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
