-- Bound durable visual Studio history without weakening optimistic versions.
-- Existing revision identities remain monotonic; history_min marks the oldest revision
-- that can still be restored after transactional retention pruning.
ALTER TABLE "flowcordia"."workflow_draft"
    ADD COLUMN "history_min" BIGINT;

-- Anchor every existing draft at its current visual state, retain at most 199 earlier
-- undo states, and discard any pre-migration redo branch. The active document and
-- optimistic draft version do not change.
UPDATE "flowcordia"."workflow_draft"
SET "history_min" = GREATEST(1, "history_cursor" - 199),
    "history_max" = "history_cursor";

DELETE FROM "flowcordia"."workflow_draft_revision" AS revision
USING "flowcordia"."workflow_draft" AS draft
WHERE revision."draft_id" = draft."id"
  AND (
    revision."revision" < draft."history_min"
    OR revision."revision" > draft."history_max"
  );

ALTER TABLE "flowcordia"."workflow_draft"
    ALTER COLUMN "history_min" SET DEFAULT 1,
    ALTER COLUMN "history_min" SET NOT NULL,
    ADD CONSTRAINT "workflow_draft_history_min_check" CHECK ("history_min" >= 1),
    ADD CONSTRAINT "workflow_draft_history_min_cursor_check" CHECK ("history_min" <= "history_cursor");
