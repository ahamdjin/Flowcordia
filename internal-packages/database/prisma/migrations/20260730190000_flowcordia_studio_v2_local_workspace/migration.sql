-- Studio V2 local workspaces are durable application state and deliberately do not
-- depend on a GitHub installation, repository, branch, or commit. One workspace is
-- scoped to an authorized organization, project, environment, and bounded key.
CREATE TABLE "flowcordia"."studio_v2_workspace" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "workspace_key" TEXT NOT NULL DEFAULT 'default',
    "document_json" JSONB NOT NULL,
    "document_sha256" TEXT NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 1,
    "tested_version" BIGINT,
    "last_test_succeeded" BOOLEAN,
    "created_by_actor_id" TEXT NOT NULL,
    "updated_by_actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_v2_workspace_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "studio_v2_workspace_public_id_key" UNIQUE ("public_id"),
    CONSTRAINT "studio_v2_workspace_scope_key" UNIQUE (
        "organization_id", "project_id", "environment_id", "workspace_key"
    ),
    CONSTRAINT "studio_v2_workspace_public_id_check" CHECK (
        "public_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
    CONSTRAINT "studio_v2_workspace_key_check" CHECK (
        "workspace_key" ~ '^[a-z][a-z0-9_-]{0,63}$'
    ),
    CONSTRAINT "studio_v2_workspace_document_hash_check" CHECK (
        "document_sha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "studio_v2_workspace_document_object_check" CHECK (
        jsonb_typeof("document_json") = 'object'
    ),
    CONSTRAINT "studio_v2_workspace_version_check" CHECK ("version" >= 1),
    CONSTRAINT "studio_v2_workspace_tested_version_check" CHECK (
        "tested_version" IS NULL OR ("tested_version" >= 1 AND "tested_version" <= "version")
    ),
    CONSTRAINT "studio_v2_workspace_test_state_check" CHECK (
        ("tested_version" IS NULL AND "last_test_succeeded" IS NULL)
        OR ("tested_version" IS NOT NULL AND "last_test_succeeded" IS NOT NULL)
    ),
    CONSTRAINT "studio_v2_workspace_actor_check" CHECK (
        char_length("created_by_actor_id") BETWEEN 1 AND 255
        AND char_length("updated_by_actor_id") BETWEEN 1 AND 255
    )
);

CREATE INDEX "studio_v2_workspace_scope_updated_idx"
    ON "flowcordia"."studio_v2_workspace"(
        "organization_id", "project_id", "environment_id", "updated_at" DESC
    );

CREATE TABLE "flowcordia"."studio_v2_workspace_event" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_v2_workspace_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "studio_v2_workspace_event_type_check" CHECK (
        char_length("event_type") BETWEEN 1 AND 100
    ),
    CONSTRAINT "studio_v2_workspace_event_actor_check" CHECK (
        char_length("actor_id") BETWEEN 1 AND 255
    ),
    CONSTRAINT "studio_v2_workspace_event_payload_check" CHECK (
        jsonb_typeof("payload") = 'object'
    )
);

CREATE INDEX "studio_v2_workspace_event_scope_time_idx"
    ON "flowcordia"."studio_v2_workspace_event"(
        "organization_id", "project_id", "environment_id", "occurred_at" DESC
    );
CREATE INDEX "studio_v2_workspace_event_workspace_time_idx"
    ON "flowcordia"."studio_v2_workspace_event"("workspace_id", "occurred_at" DESC);

ALTER TABLE "flowcordia"."studio_v2_workspace"
    ADD CONSTRAINT "studio_v2_workspace_organization_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "studio_v2_workspace_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "studio_v2_workspace_environment_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "public"."RuntimeEnvironment"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flowcordia"."studio_v2_workspace_event"
    ADD CONSTRAINT "studio_v2_workspace_event_workspace_fkey"
        FOREIGN KEY ("workspace_id") REFERENCES "flowcordia"."studio_v2_workspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "studio_v2_workspace_event_organization_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "studio_v2_workspace_event_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "studio_v2_workspace_event_environment_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "public"."RuntimeEnvironment"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
