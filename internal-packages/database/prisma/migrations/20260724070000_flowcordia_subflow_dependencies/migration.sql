-- Dependency metadata is derived from the same exact workflow document and commit as each
-- durable index entry. Version 0 preserves existing rows but cannot authorize subflow publication;
-- the next repository synchronization replaces it with version 1 metadata.
ALTER TABLE "flowcordia"."workflow_index_entry"
    ADD COLUMN "dependency_metadata_version" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "subflow_workflow_ids" JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE "flowcordia"."workflow_index_entry"
    ADD CONSTRAINT "workflow_index_entry_dependency_version_check"
        CHECK ("dependency_metadata_version" IN (0, 1)),
    ADD CONSTRAINT "workflow_index_entry_subflow_ids_shape_check"
        CHECK (
            jsonb_typeof("subflow_workflow_ids") = 'array'
            AND jsonb_array_length("subflow_workflow_ids") <= 100
        );
