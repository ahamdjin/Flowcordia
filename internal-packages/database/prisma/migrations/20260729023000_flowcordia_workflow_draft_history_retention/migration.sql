-- Bound durable visual Studio history without weakening optimistic versions.
-- Existing revision identities remain monotonic; history_min marks the oldest revision
-- that can still be restored after transactional retention pruning.
ALTER TABLE "flowcordia"."workflow_draft"
    ADD COLUMN "history_min" BIGINT;

UPDATE "flowcordia"."workflow_draft"
SET "history_min" = 1;

ALTER TABLE "flowcordia"."workflow_draft"
    ALTER COLUMN "history_min" SET DEFAULT 1,
    ALTER COLUMN "history_min" SET NOT NULL,
    ADD CONSTRAINT "workflow_draft_history_min_check" CHECK ("history_min" >= 1),
    ADD CONSTRAINT "workflow_draft_history_min_cursor_check" CHECK ("history_min" <= "history_cursor");
