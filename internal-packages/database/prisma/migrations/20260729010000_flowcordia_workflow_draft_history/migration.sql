-- Durable visual Studio undo/redo history.
-- Every accepted visual document state is stored as a validated snapshot. The active
-- draft keeps a logical history cursor while its optimistic version remains monotonic.
ALTER TABLE "flowcordia"."workflow_draft"
    ADD COLUMN "history_cursor" BIGINT,
    ADD COLUMN "history_max" BIGINT;

UPDATE "flowcordia"."workflow_draft"
SET "history_cursor" = 1,
    "history_max" = 1;

ALTER TABLE "flowcordia"."workflow_draft"
    ALTER COLUMN "history_cursor" SET DEFAULT 1,
    ALTER COLUMN "history_cursor" SET NOT NULL,
    ALTER COLUMN "history_max" SET DEFAULT 1,
    ALTER COLUMN "history_max" SET NOT NULL,
    ADD CONSTRAINT "workflow_draft_history_cursor_check" CHECK ("history_cursor" >= 1),
    ADD CONSTRAINT "workflow_draft_history_max_check" CHECK ("history_max" >= "history_cursor");

CREATE TABLE "flowcordia"."workflow_draft_revision" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "revision" BIGINT NOT NULL,
    "draft_version" BIGINT NOT NULL,
    "document_json" JSONB NOT NULL,
    "document_sha256" TEXT NOT NULL,
    "command_summary" JSONB NOT NULL,
    "created_by_actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_draft_revision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_draft_revision_draft_revision_key" UNIQUE ("draft_id", "revision"),
    CONSTRAINT "workflow_draft_revision_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "workflow_draft_revision_version_check" CHECK ("draft_version" >= 1),
    CONSTRAINT "workflow_draft_revision_document_hash_check" CHECK ("document_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "workflow_draft_revision_document_object_check" CHECK (jsonb_typeof("document_json") = 'object'),
    CONSTRAINT "workflow_draft_revision_summary_check" CHECK (jsonb_typeof("command_summary") = 'object'),
    CONSTRAINT "workflow_draft_revision_actor_check" CHECK (char_length("created_by_actor_id") BETWEEN 1 AND 255)
);

CREATE INDEX "workflow_draft_revision_draft_created_idx"
    ON "flowcordia"."workflow_draft_revision"("draft_id", "revision" DESC);

ALTER TABLE "flowcordia"."workflow_draft_revision"
    ADD CONSTRAINT "workflow_draft_revision_draft_fkey"
    FOREIGN KEY ("draft_id") REFERENCES "flowcordia"."workflow_draft"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing drafts begin with their currently validated document as the only available
-- revision. Historical states prior to this migration are intentionally not inferred.
INSERT INTO "flowcordia"."workflow_draft_revision" (
    "id", "draft_id", "revision", "draft_version", "document_json",
    "document_sha256", "command_summary", "created_by_actor_id", "created_at"
)
SELECT
    'bootstrap-' || "id",
    "id",
    1,
    "version",
    "document_json",
    "document_sha256",
    jsonb_build_object('command', 'history.bootstrap'),
    "updated_by_actor_id",
    "updated_at"
FROM "flowcordia"."workflow_draft";
