import { randomUUID } from "node:crypto";
import { workflowSha256 } from "@flowcordia/control-plane";
import { validateWorkflow, type WorkflowDefinition } from "@flowcordia/workflow";
import { Prisma } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import { WorkflowDraftError } from "./errors";
import type {
  WorkflowDraftAuditInput,
  WorkflowDraftRecord,
  WorkflowDraftScope,
  WorkflowDraftSourceIdentity,
} from "./types";

interface DraftRow {
  id: string;
  publicId: string;
  workflowId: string;
  workflowPath: string;
  status: WorkflowDraftRecord["status"];
  baseCommitSha: string;
  baseBlobSha: string;
  baseCanonicalSha256: string;
  documentJson: unknown;
  documentSha256: string;
  version: bigint;
  createdByActorId: string;
  updatedByActorId: string;
  discardedByActorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  discardedAt: Date | null;
}

function scopePredicate(scope: WorkflowDraftScope) {
  return Prisma.sql`
    "organization_id" = ${scope.tenantId}
    AND "project_id" = ${scope.projectId}
    AND "github_app_installation_id" = ${scope.githubAppInstallationId}
    AND "app_installation_id" = ${BigInt(scope.installationId)}
    AND "repository_id" = ${scope.repositoryId}
    AND "repository_github_id" = ${BigInt(scope.repositoryGithubId)}
    AND "repository_owner" = ${scope.repository.owner}
    AND "repository_name" = ${scope.repository.name}
    AND "branch" = ${scope.repository.branch}
  `;
}

function draftColumns() {
  return Prisma.sql`
    "id",
    "public_id" AS "publicId",
    "workflow_id" AS "workflowId",
    "workflow_path" AS "workflowPath",
    "status",
    "base_commit_sha" AS "baseCommitSha",
    "base_blob_sha" AS "baseBlobSha",
    "base_canonical_sha256" AS "baseCanonicalSha256",
    "document_json" AS "documentJson",
    "document_sha256" AS "documentSha256",
    "version",
    "created_by_actor_id" AS "createdByActorId",
    "updated_by_actor_id" AS "updatedByActorId",
    "discarded_by_actor_id" AS "discardedByActorId",
    "created_at" AS "createdAt",
    "updated_at" AS "updatedAt",
    "discarded_at" AS "discardedAt"
  `;
}

function decodeDraft(row: DraftRow): WorkflowDraftRecord {
  const validated = validateWorkflow(row.documentJson);
  if (!validated.success) {
    throw new WorkflowDraftError(
      "corrupt_draft",
      "The stored workflow draft no longer satisfies the canonical workflow contract."
    );
  }
  if (workflowSha256(validated.workflow) !== row.documentSha256) {
    throw new WorkflowDraftError(
      "corrupt_draft",
      "The stored workflow draft content does not match its integrity hash."
    );
  }
  return {
    id: row.id,
    publicId: row.publicId,
    workflowId: row.workflowId,
    workflowPath: row.workflowPath,
    status: row.status,
    baseCommitSha: row.baseCommitSha,
    baseBlobSha: row.baseBlobSha,
    baseCanonicalSha256: row.baseCanonicalSha256,
    document: validated.workflow,
    documentSha256: row.documentSha256,
    version: row.version,
    createdByActorId: row.createdByActorId,
    updatedByActorId: row.updatedByActorId,
    discardedByActorId: row.discardedByActorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    discardedAt: row.discardedAt,
  };
}

async function appendAudit(
  tx: Prisma.TransactionClient,
  scope: WorkflowDraftScope,
  draftId: string,
  audit: WorkflowDraftAuditInput
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "flowcordia"."workflow_draft_audit_event" (
      "id", "draft_id", "organization_id", "project_id", "repository_id", "event_type",
      "actor_id", "correlation_id", "dedupe_key", "payload", "occurred_at", "created_at"
    ) VALUES (
      ${randomUUID()}, ${draftId}, ${scope.tenantId}, ${scope.projectId}, ${scope.repositoryId},
      ${audit.eventType}, ${audit.actorId}, ${audit.correlationId}, ${audit.dedupeKey},
      CAST(${JSON.stringify(audit.payload)} AS JSONB), ${audit.occurredAt}, ${audit.occurredAt}
    )
    ON CONFLICT ("dedupe_key") DO NOTHING
  `);
}

async function selectActive(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  scope: WorkflowDraftScope,
  predicate: Prisma.Sql
): Promise<WorkflowDraftRecord | null> {
  const rows = await client.$queryRaw<DraftRow[]>(Prisma.sql`
    SELECT ${draftColumns()}
    FROM "flowcordia"."workflow_draft"
    WHERE ${scopePredicate(scope)}
      AND "status" = 'ACTIVE'
      AND ${predicate}
    LIMIT 1
  `);
  return rows[0] ? decodeDraft(rows[0]) : null;
}

export async function getActiveWorkflowDraft(
  scope: WorkflowDraftScope,
  workflowId: string
): Promise<WorkflowDraftRecord | null> {
  return selectActive(prisma, scope, Prisma.sql`"workflow_id" = ${workflowId}`);
}

export async function getActiveWorkflowDraftByPublicId(
  scope: WorkflowDraftScope,
  publicId: string
): Promise<WorkflowDraftRecord | null> {
  return selectActive(prisma, scope, Prisma.sql`"public_id" = ${publicId}`);
}

export async function createOrResumeWorkflowDraft(input: {
  scope: WorkflowDraftScope;
  source: WorkflowDraftSourceIdentity;
  workflow: WorkflowDefinition;
  actorId: string;
  correlationId: string;
  now?: Date;
}): Promise<{ draft: WorkflowDraftRecord; created: boolean }> {
  const now = input.now ?? new Date();
  const documentSha256 = workflowSha256(input.workflow);
  return prisma.$transaction(async (tx) => {
    const existing = await selectActive(
      tx,
      input.scope,
      Prisma.sql`"workflow_id" = ${input.source.workflowId}`
    );
    if (existing) {
      await appendAudit(tx, input.scope, existing.id, {
        eventType: "workflow_draft.resumed",
        actorId: input.actorId,
        correlationId: input.correlationId,
        dedupeKey: `workflow-draft:${existing.publicId}:resume:${input.correlationId}`,
        payload: {
          publicId: existing.publicId,
          workflowId: existing.workflowId,
          version: existing.version.toString(),
          documentSha256: existing.documentSha256,
        },
        occurredAt: now,
      });
      return { draft: existing, created: false };
    }

    const id = randomUUID();
    const publicId = randomUUID();
    const rows = await tx.$queryRaw<DraftRow[]>(Prisma.sql`
      INSERT INTO "flowcordia"."workflow_draft" (
        "id", "public_id", "organization_id", "project_id", "github_app_installation_id",
        "app_installation_id", "repository_id", "repository_github_id", "repository_owner",
        "repository_name", "branch", "workflow_id", "workflow_path", "status",
        "base_commit_sha", "base_blob_sha", "base_canonical_sha256", "document_json",
        "document_sha256", "version", "created_by_actor_id", "updated_by_actor_id",
        "created_at", "updated_at"
      ) VALUES (
        ${id}, ${publicId}, ${input.scope.tenantId}, ${input.scope.projectId},
        ${input.scope.githubAppInstallationId}, ${BigInt(input.scope.installationId)},
        ${input.scope.repositoryId}, ${BigInt(input.scope.repositoryGithubId)},
        ${input.scope.repository.owner}, ${input.scope.repository.name}, ${input.scope.repository.branch},
        ${input.source.workflowId}, ${input.source.workflowPath}, 'ACTIVE',
        ${input.source.baseCommitSha}, ${input.source.baseBlobSha},
        ${input.source.baseCanonicalSha256}, CAST(${JSON.stringify(input.workflow)} AS JSONB),
        ${documentSha256}, 1, ${input.actorId}, ${input.actorId}, ${now}, ${now}
      )
      ON CONFLICT ("project_id", "repository_id", "workflow_id") WHERE "status" = 'ACTIVE'
      DO NOTHING
      RETURNING ${draftColumns()}
    `);

    const created = rows[0]
      ? decodeDraft(rows[0])
      : await selectActive(tx, input.scope, Prisma.sql`"workflow_id" = ${input.source.workflowId}`);
    if (!created) {
      throw new WorkflowDraftError(
        "draft_unavailable",
        "The workflow draft could not be created or resumed safely.",
        true
      );
    }

    await appendAudit(tx, input.scope, created.id, {
      eventType: rows[0] ? "workflow_draft.started" : "workflow_draft.resumed",
      actorId: input.actorId,
      correlationId: input.correlationId,
      dedupeKey: `workflow-draft:${created.publicId}:${rows[0] ? "start" : "resume"}:${input.correlationId}`,
      payload: {
        publicId: created.publicId,
        workflowId: created.workflowId,
        version: created.version.toString(),
        baseCommitSha: created.baseCommitSha,
        baseBlobSha: created.baseBlobSha,
        baseCanonicalSha256: created.baseCanonicalSha256,
        documentSha256: created.documentSha256,
      },
      occurredAt: now,
    });
    return { draft: created, created: Boolean(rows[0]) };
  });
}

export async function updateWorkflowDraft(input: {
  scope: WorkflowDraftScope;
  publicId: string;
  expectedVersion: bigint;
  workflow: WorkflowDefinition;
  actorId: string;
  correlationId: string;
  commandSummary: Record<string, unknown>;
  now?: Date;
}): Promise<WorkflowDraftRecord> {
  const now = input.now ?? new Date();
  const documentSha256 = workflowSha256(input.workflow);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<DraftRow[]>(Prisma.sql`
      UPDATE "flowcordia"."workflow_draft"
      SET
        "document_json" = CAST(${JSON.stringify(input.workflow)} AS JSONB),
        "document_sha256" = ${documentSha256},
        "version" = "version" + 1,
        "updated_by_actor_id" = ${input.actorId},
        "updated_at" = ${now}
      WHERE ${scopePredicate(input.scope)}
        AND "public_id" = ${input.publicId}
        AND "status" = 'ACTIVE'
        AND "version" = ${input.expectedVersion}
      RETURNING ${draftColumns()}
    `);
    if (!rows[0]) {
      const current = await selectActive(
        tx,
        input.scope,
        Prisma.sql`"public_id" = ${input.publicId}`
      );
      if (!current) {
        throw new WorkflowDraftError("draft_not_found", "The active workflow draft was not found.");
      }
      throw new WorkflowDraftError(
        "draft_conflict",
        "The workflow draft changed in another session. Refresh before applying this edit."
      );
    }
    const updated = decodeDraft(rows[0]);
    await appendAudit(tx, input.scope, updated.id, {
      eventType: "workflow_draft.edited",
      actorId: input.actorId,
      correlationId: input.correlationId,
      dedupeKey: `workflow-draft:${updated.publicId}:edit:${input.correlationId}`,
      payload: {
        publicId: updated.publicId,
        workflowId: updated.workflowId,
        previousVersion: input.expectedVersion.toString(),
        version: updated.version.toString(),
        documentSha256: updated.documentSha256,
        ...input.commandSummary,
      },
      occurredAt: now,
    });
    return updated;
  });
}

export async function discardWorkflowDraft(input: {
  scope: WorkflowDraftScope;
  publicId: string;
  expectedVersion: bigint;
  actorId: string;
  correlationId: string;
  now?: Date;
}): Promise<WorkflowDraftRecord> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<DraftRow[]>(Prisma.sql`
      UPDATE "flowcordia"."workflow_draft"
      SET
        "status" = 'DISCARDED',
        "version" = "version" + 1,
        "updated_by_actor_id" = ${input.actorId},
        "discarded_by_actor_id" = ${input.actorId},
        "updated_at" = ${now},
        "discarded_at" = ${now}
      WHERE ${scopePredicate(input.scope)}
        AND "public_id" = ${input.publicId}
        AND "status" = 'ACTIVE'
        AND "version" = ${input.expectedVersion}
      RETURNING ${draftColumns()}
    `);
    if (!rows[0]) {
      const current = await selectActive(
        tx,
        input.scope,
        Prisma.sql`"public_id" = ${input.publicId}`
      );
      if (!current) {
        throw new WorkflowDraftError("draft_not_found", "The active workflow draft was not found.");
      }
      throw new WorkflowDraftError(
        "draft_conflict",
        "The workflow draft changed in another session. Refresh before discarding it."
      );
    }
    const discarded = decodeDraft(rows[0]);
    await appendAudit(tx, input.scope, discarded.id, {
      eventType: "workflow_draft.discarded",
      actorId: input.actorId,
      correlationId: input.correlationId,
      dedupeKey: `workflow-draft:${discarded.publicId}:discard:${input.correlationId}`,
      payload: {
        publicId: discarded.publicId,
        workflowId: discarded.workflowId,
        previousVersion: input.expectedVersion.toString(),
        version: discarded.version.toString(),
        documentSha256: discarded.documentSha256,
      },
      occurredAt: now,
    });
    return discarded;
  });
}
