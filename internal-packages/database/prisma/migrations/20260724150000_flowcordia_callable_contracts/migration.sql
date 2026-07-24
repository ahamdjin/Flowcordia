ALTER TABLE "flowcordia"."workflow_index_entry"
  ADD COLUMN "callable_contract_metadata_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "callable_contract_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "callable_input_schema" JSONB,
  ADD COLUMN "callable_output_schema" JSONB,
  ADD COLUMN "callable_failure_code" TEXT,
  ADD COLUMN "callable_failure_message" TEXT;

ALTER TABLE "flowcordia"."workflow_index_entry"
  ADD CONSTRAINT "workflow_index_entry_callable_contract_check" CHECK (
    (
      "callable_contract_metadata_version" = 0
      AND "callable_contract_state" = 'UNKNOWN'
      AND "callable_input_schema" IS NULL
      AND "callable_output_schema" IS NULL
      AND "callable_failure_code" IS NULL
      AND "callable_failure_message" IS NULL
    )
    OR
    (
      "callable_contract_metadata_version" = 1
      AND "callable_contract_state" = 'READY'
      AND jsonb_typeof("callable_input_schema") = 'object'
      AND jsonb_typeof("callable_output_schema") = 'object'
      AND "callable_failure_code" IS NULL
      AND "callable_failure_message" IS NULL
    )
    OR
    (
      "callable_contract_metadata_version" = 1
      AND "callable_contract_state" = 'BLOCKED'
      AND "callable_input_schema" IS NULL
      AND "callable_output_schema" IS NULL
      AND char_length("callable_failure_code") BETWEEN 1 AND 100
      AND char_length("callable_failure_message") BETWEEN 1 AND 1000
    )
  );

CREATE INDEX "workflow_index_entry_callable_contract_idx"
  ON "flowcordia"."workflow_index_entry"(
    "project_id",
    "repository_id",
    "source_commit_sha",
    "callable_contract_state",
    "workflow_id"
  );
