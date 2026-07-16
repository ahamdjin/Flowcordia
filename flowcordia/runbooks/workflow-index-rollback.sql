-- Reference only. Execute through the normal reviewed migration/operations process.
-- Stop Flowcordia operations workers and disable Studio access before any destructive action.

BEGIN;

DROP TABLE IF EXISTS "flowcordia"."workflow_index_webhook_delivery";
DROP TABLE IF EXISTS "flowcordia"."workflow_index_audit_event";
DROP TABLE IF EXISTS "flowcordia"."workflow_index_entry";
DROP TABLE IF EXISTS "flowcordia"."workflow_index_sync";
DROP SCHEMA IF EXISTS "flowcordia";

COMMIT;
