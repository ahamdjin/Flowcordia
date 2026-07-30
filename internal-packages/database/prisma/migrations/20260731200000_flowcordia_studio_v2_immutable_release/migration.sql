-- Studio V2 releases are immutable, tamper-evident snapshots of one exact tested
-- local workspace revision and its generated Trigger.dev task source.
CREATE TABLE "flowcordia"."studio_v2_release" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "workspace_key" TEXT NOT NULL,
    "workspace_version" BIGINT NOT NULL,
    "document_json" JSONB NOT NULL,
    "document_sha256" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "validation_task_id" TEXT,
    "export_name" TEXT NOT NULL,
    "generated_source" TEXT NOT NULL,
    "source_sha256" TEXT NOT NULL,
    "ordered_node_ids" JSONB NOT NULL,
    "trigger_binding" JSONB,
    "warnings" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STAGED',
    "deployment_id" TEXT,
    "failure_message" TEXT,
    "staged_by_actor_id" TEXT NOT NULL,
    "deployed_by_actor_id" TEXT,
    "staged_at" TIMESTAMP(3) NOT NULL,
    "deployed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_v2_release_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "studio_v2_release_public_id_key" UNIQUE ("public_id"),
    CONSTRAINT "studio_v2_release_workspace_version_key" UNIQUE (
        "workspace_id", "workspace_version"
    ),
    CONSTRAINT "studio_v2_release_public_id_check" CHECK (
        "public_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
    CONSTRAINT "studio_v2_release_workspace_key_check" CHECK (
        "workspace_key" ~ '^[a-z][a-z0-9_-]{0,63}$'
    ),
    CONSTRAINT "studio_v2_release_version_check" CHECK ("workspace_version" >= 1),
    CONSTRAINT "studio_v2_release_document_hash_check" CHECK (
        "document_sha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "studio_v2_release_source_hash_check" CHECK (
        "source_sha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "studio_v2_release_document_object_check" CHECK (
        jsonb_typeof("document_json") = 'object'
    ),
    CONSTRAINT "studio_v2_release_ordered_nodes_check" CHECK (
        jsonb_typeof("ordered_node_ids") = 'array'
    ),
    CONSTRAINT "studio_v2_release_trigger_binding_check" CHECK (
        "trigger_binding" IS NULL OR jsonb_typeof("trigger_binding") = 'object'
    ),
    CONSTRAINT "studio_v2_release_warnings_check" CHECK (
        jsonb_typeof("warnings") = 'array'
    ),
    CONSTRAINT "studio_v2_release_status_check" CHECK (
        "status" IN ('STAGED', 'DEPLOYING', 'DEPLOYED', 'FAILED')
    ),
    CONSTRAINT "studio_v2_release_identity_check" CHECK (
        char_length("task_id") BETWEEN 1 AND 255
        AND char_length("export_name") BETWEEN 1 AND 255
        AND char_length("generated_source") BETWEEN 1 AND 5000000
    ),
    CONSTRAINT "studio_v2_release_actor_check" CHECK (
        char_length("staged_by_actor_id") BETWEEN 1 AND 255
        AND ("deployed_by_actor_id" IS NULL OR char_length("deployed_by_actor_id") BETWEEN 1 AND 255)
    ),
    CONSTRAINT "studio_v2_release_deployment_state_check" CHECK (
        ("status" = 'STAGED' AND "deployment_id" IS NULL AND "deployed_at" IS NULL)
        OR ("status" IN ('DEPLOYING', 'DEPLOYED', 'FAILED') AND "deployment_id" IS NOT NULL)
    )
);

CREATE INDEX "studio_v2_release_scope_staged_idx"
    ON "flowcordia"."studio_v2_release"(
        "organization_id", "project_id", "environment_id", "workspace_key", "staged_at" DESC
    );
CREATE INDEX "studio_v2_release_deployment_idx"
    ON "flowcordia"."studio_v2_release"("deployment_id")
    WHERE "deployment_id" IS NOT NULL;

ALTER TABLE "flowcordia"."studio_v2_release"
    ADD CONSTRAINT "studio_v2_release_workspace_fkey"
        FOREIGN KEY ("workspace_id") REFERENCES "flowcordia"."studio_v2_workspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "studio_v2_release_organization_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "studio_v2_release_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "studio_v2_release_environment_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "public"."RuntimeEnvironment"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "studio_v2_release_deployment_fkey"
        FOREIGN KEY ("deployment_id") REFERENCES "public"."WorkerDeployment"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "flowcordia"."protect_studio_v2_release_snapshot"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
       OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
       OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
       OR NEW."environment_id" IS DISTINCT FROM OLD."environment_id"
       OR NEW."workspace_key" IS DISTINCT FROM OLD."workspace_key"
       OR NEW."workspace_version" IS DISTINCT FROM OLD."workspace_version"
       OR NEW."document_json" IS DISTINCT FROM OLD."document_json"
       OR NEW."document_sha256" IS DISTINCT FROM OLD."document_sha256"
       OR NEW."task_id" IS DISTINCT FROM OLD."task_id"
       OR NEW."validation_task_id" IS DISTINCT FROM OLD."validation_task_id"
       OR NEW."export_name" IS DISTINCT FROM OLD."export_name"
       OR NEW."generated_source" IS DISTINCT FROM OLD."generated_source"
       OR NEW."source_sha256" IS DISTINCT FROM OLD."source_sha256"
       OR NEW."ordered_node_ids" IS DISTINCT FROM OLD."ordered_node_ids"
       OR NEW."trigger_binding" IS DISTINCT FROM OLD."trigger_binding"
       OR NEW."warnings" IS DISTINCT FROM OLD."warnings"
       OR NEW."staged_by_actor_id" IS DISTINCT FROM OLD."staged_by_actor_id"
       OR NEW."staged_at" IS DISTINCT FROM OLD."staged_at"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'Studio V2 release snapshots are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "studio_v2_release_snapshot_immutable"
BEFORE UPDATE ON "flowcordia"."studio_v2_release"
FOR EACH ROW EXECUTE FUNCTION "flowcordia"."protect_studio_v2_release_snapshot"();
