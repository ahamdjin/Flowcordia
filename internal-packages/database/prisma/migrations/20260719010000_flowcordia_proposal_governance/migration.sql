-- Proposal governance is repository-scoped durable control-plane state. The immutable
-- enterprise floor remains application-owned; this table stores only bounded strengthening rules.
CREATE TABLE "flowcordia"."proposal_governance_policy" (
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
    "schema_version" TEXT NOT NULL,
    "minimum_approvals" SMALLINT NOT NULL,
    "required_check_names" JSONB NOT NULL,
    "required_reviewer_ids" JSONB NOT NULL,
    "allowed_reviewer_ids" JSONB,
    "policy_digest" TEXT NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_by_actor_id" TEXT NOT NULL,
    "updated_by_actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_governance_policy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "proposal_governance_policy_public_id_key" UNIQUE ("public_id"),
    CONSTRAINT "proposal_governance_policy_scope_key" UNIQUE ("project_id", "repository_id"),
    CONSTRAINT "proposal_governance_policy_public_id_check" CHECK ("public_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
    CONSTRAINT "proposal_governance_policy_schema_check" CHECK ("schema_version" = '0.1'),
    CONSTRAINT "proposal_governance_policy_approvals_check" CHECK ("minimum_approvals" BETWEEN 1 AND 10),
    CONSTRAINT "proposal_governance_policy_checks_json_check" CHECK (jsonb_typeof("required_check_names") = 'array' AND jsonb_array_length("required_check_names") <= 50),
    CONSTRAINT "proposal_governance_policy_required_reviewers_json_check" CHECK (jsonb_typeof("required_reviewer_ids") = 'array' AND jsonb_array_length("required_reviewer_ids") <= 50),
    CONSTRAINT "proposal_governance_policy_allowed_reviewers_json_check" CHECK ("allowed_reviewer_ids" IS NULL OR (jsonb_typeof("allowed_reviewer_ids") = 'array' AND jsonb_array_length("allowed_reviewer_ids") <= 50)),
    CONSTRAINT "proposal_governance_policy_digest_check" CHECK ("policy_digest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "proposal_governance_policy_version_check" CHECK ("version" >= 1),
    CONSTRAINT "proposal_governance_policy_repository_check" CHECK (char_length("repository_owner") BETWEEN 1 AND 100 AND char_length("repository_name") BETWEEN 1 AND 100 AND char_length("branch") BETWEEN 1 AND 255),
    CONSTRAINT "proposal_governance_policy_actor_check" CHECK (char_length("created_by_actor_id") BETWEEN 1 AND 255 AND char_length("updated_by_actor_id") BETWEEN 1 AND 255)
);

CREATE INDEX "proposal_governance_policy_scope_updated_idx"
    ON "flowcordia"."proposal_governance_policy"("organization_id", "project_id", "repository_id", "updated_at" DESC);
CREATE INDEX "proposal_governance_policy_installation_idx"
    ON "flowcordia"."proposal_governance_policy"("github_app_installation_id", "repository_id");

CREATE TABLE "flowcordia"."proposal_governance_policy_audit_event" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
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

    CONSTRAINT "proposal_governance_policy_audit_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "proposal_governance_policy_audit_dedupe_key" UNIQUE ("dedupe_key"),
    CONSTRAINT "proposal_governance_policy_audit_type_check" CHECK (char_length("event_type") BETWEEN 1 AND 100),
    CONSTRAINT "proposal_governance_policy_audit_actor_check" CHECK (char_length("actor_id") BETWEEN 1 AND 255),
    CONSTRAINT "proposal_governance_policy_audit_correlation_check" CHECK (char_length("correlation_id") BETWEEN 1 AND 255),
    CONSTRAINT "proposal_governance_policy_audit_payload_check" CHECK (jsonb_typeof("payload") = 'object')
);

CREATE INDEX "proposal_governance_policy_audit_scope_time_idx"
    ON "flowcordia"."proposal_governance_policy_audit_event"("organization_id", "project_id", "repository_id", "occurred_at" DESC);
CREATE INDEX "proposal_governance_policy_audit_policy_time_idx"
    ON "flowcordia"."proposal_governance_policy_audit_event"("policy_id", "occurred_at" DESC);
CREATE INDEX "proposal_governance_policy_audit_correlation_idx"
    ON "flowcordia"."proposal_governance_policy_audit_event"("correlation_id");

ALTER TABLE "flowcordia"."proposal_governance_policy"
    ADD CONSTRAINT "proposal_governance_policy_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "proposal_governance_policy_project_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "proposal_governance_policy_installation_fkey" FOREIGN KEY ("github_app_installation_id") REFERENCES "public"."GithubAppInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "proposal_governance_policy_repository_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flowcordia"."proposal_governance_policy_audit_event"
    ADD CONSTRAINT "proposal_governance_policy_audit_policy_fkey" FOREIGN KEY ("policy_id") REFERENCES "flowcordia"."proposal_governance_policy"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "proposal_governance_policy_audit_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "proposal_governance_policy_audit_project_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "proposal_governance_policy_audit_repository_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
