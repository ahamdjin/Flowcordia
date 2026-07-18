import { randomUUID } from "node:crypto";
import { Prisma } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import { WorkflowDraftError } from "./errors";
import type {
  WorkflowDraftSourceAuditInput,
  WorkflowDraftSourceFileRecord,
  WorkflowDraftSourceIdentity,
} from "./source-types";
import { isWorkflowDraftSourceChanged, sourceTextSha256 } from "./source-types";
import type { WorkflowDraftRecord, WorkflowDraftScope } from "./types";

interface SourceRow {
  id: string;
  publicId: string;
  draftId: string;
  functionId: string;
  sourcePath: string;
  exportName: string;
  baseCommitSha: string;
  baseBlobSha: string;
  baseSourceText: string;
  baseSourceSha256: string;
  sourceText: string;
  sourceSha256: string;
  version: bigint;
  createdByActorId: string;
  updatedByActorId: string;
  createdAt: Date;
  updatedAt: Date;
}

function scopePredicate(scope: WorkflowDraftScope) {
  return Prisma.sql`
    d."organization_id" = ${scope.tenantId}
    AND d."project_id" = ${scope.projectId}
    AND d."github_app_installation_id" = ${scope.githubAppInstallationId}
    AND d."app_installation_id" = ${BigInt(scope.installationId)}
    AND d."repository_id" = ${scope.repositoryId}
    AND d."repository_github_id" = ${BigInt(scope.repositoryGithubId)}
    AND d."repository_owner" = ${scope.repository.owner}
    AND d."repository_name" = ${scope.repository.name}
    AND d."branch" = ${scope.repository.branch}
    AND d."status" = 'ACTIVE'
  `;
}

function sourceColumns() {
  return Prisma.sql`
    s."id",
    s."public_id" AS "publicId",
    s."draft_id" AS "draftId",
    s."function_id" AS "functionId",
    s."source_path" AS "sourcePath",
    s."export_name" AS "exportName",
    s."base_commit_sha" AS "baseCommitSha",
    s."base_blob_sha" AS "baseBlobSha",
    s."base_source_text" AS "baseSourceText",
    s."base_source_sha256" AS "baseSourceSha256",
    s."source_text" AS "sourceText",
    s."source_sha256" AS "sourceSha256",
    s."version",
    s."created_by_actor_id" AS "createdByActorId",
    s."updated_by_actor_id" AS "updatedByActorId",
    s."created_at" AS "createdAt",
    s."updated_at" AS "updatedAt"
  `;
}

function decodeSource(row: SourceRow): WorkflowDraftSourceFileRecord {
  if (sourceTextSha256(row.baseSourceText) !== row.baseSourceSha256) {
    throw new WorkflowDraftError(
      "corrupt_draft",
      "The stored repository base source does not match its integrity hash."
    );
  }
  if (sourceTextSha256(row.sourceText) !== row.sourceSha256) {
    throw new WorkflowDraftError(
      "corrupt_draft",
      "The stored repository source draft does not match its integrity hash."
    );
  }
  return { ...row };
}

async function appendAudit(
  tx: Prisma.TransactionClient,
  scope: WorkflowDraftScope,
  source: WorkflowDraftSourceFileRecord,
  audit: WorkflowDraftSourceAuditInput
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "flowcordia"."workflow_draft_source_audit_event" (
      "id", "source_file_id", "draft_id", "organization_id", "project_id", "repository_id",
      "event_type", "actor_id", "correlation_id", "dedupe_key", "payload", "occurred_at",
      "created_at"
    ) VALUES (
      ${randomUUID()}, ${source.id}, ${source.draftId}, ${scope.tenantId}, ${scope.projectId},
      ${scope.repositoryId}, ${audit.eventType}, ${audit.actorId}, ${audit.correlationId},
      ${audit.dedupeKey}, CAST(${JSON.stringify(audit.payload)} AS JSONB), ${audit.occurredAt},
      ${audit.occurredAt}
    )
    ON CONFLICT ("dedupe_key") DO NOTHING
  `);
}

async function selectOne(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  scope: WorkflowDraftScope,
  predicate: Prisma.Sql
): Promise<WorkflowDraftSourceFileRecord | null> {
  const rows = await client.$queryRaw<SourceRow[]>(Prisma.sql`
    SELECT ${sourceColumns()}
    FROM "flowcordia"."workflow_draft_source_file" s
    INNER JOIN "flowcordia"."workflow_draft" d ON d."id" = s."draft_id"
    WHERE ${scopePredicate(scope)} AND ${predicate}
    LIMIT 1
  `);
  return rows[0] ? decodeSource(rows[0]) : null;
}

export async function getWorkflowDraftSourceFileByPublicId(
  scope: WorkflowDraftScope,
  publicId: string
): Promise<WorkflowDraftSourceFileRecord | null> {
  return selectOne(prisma, scope, Prisma.sql`s."public_id" = ${publicId}`);
}

export async function getWorkflowDraftSourceFiles(
  scope: WorkflowDraftScope,
  draftPublicId: string
): Promise<WorkflowDraftSourceFileRecord[]> {
  const rows = await prisma.$queryRaw<SourceRow[]>(Prisma.sql`
    SELECT ${sourceColumns()}
    FROM "flowcordia"."workflow_draft_source_file" s
    INNER JOIN "flowcordia"."workflow_draft" d ON d."id" = s."draft_id"
    WHERE ${scopePredicate(scope)} AND d."public_id" = ${draftPublicId}
    ORDER BY s."source_path" ASC
  `);
  return rows.map(decodeSource);
}

export async function getChangedWorkflowDraftSourceFiles(
  scope: WorkflowDraftScope,
  draftPublicId: string
): Promise<WorkflowDraftSourceFileRecord[]> {
  return (await getWorkflowDraftSourceFiles(scope, draftPublicId)).filter(
    isWorkflowDraftSourceChanged
  );
}

export async function createOrResumeWorkflowDraftSourceFile(input: {
  scope: WorkflowDraftScope;
  draft: WorkflowDraftRecord;
  identity: WorkflowDraftSourceIdentity;
  sourceText: string;
  actorId: string;
  correlationId: string;
  now?: Date;
}): Promise<{ source: WorkflowDraftSourceFileRecord; created: boolean }> {
  const now = input.now ?? new Date();
  const baseSourceSha256 = sourceTextSha256(input.sourceText);
  return prisma.$transaction(async (tx) => {
    const existing = await selectOne(
      tx,
      input.scope,
      Prisma.sql`
        d."public_id" = ${input.draft.publicId}
        AND s."source_path" = ${input.identity.sourcePath}
      `
    );
    if (existing) {
      if (
        existing.draftId !== input.draft.id ||
        existing.baseCommitSha !== input.identity.baseCommitSha ||
        existing.baseBlobSha !== input.identity.baseBlobSha ||
        existing.baseSourceSha256 !== baseSourceSha256
      ) {
        throw new WorkflowDraftError(
          "stale_source",
          "The repository source buffer is bound to different immutable source identity."
        );
      }
      await appendAudit(tx, input.scope, existing, {
        eventType: "workflow_draft_source.resumed",
        actorId: input.actorId,
        correlationId: input.correlationId,
        dedupeKey: `workflow-draft-source:${existing.publicId}:resume:${input.correlationId}`,
        payload: {
          publicId: existing.publicId,
          draftPublicId: input.draft.publicId,
          functionId: input.identity.functionId,
          sourcePath: existing.sourcePath,
          version: existing.version.toString(),
          sourceSha256: existing.sourceSha256,
        },
        occurredAt: now,
      });
      return { source: existing, created: false };
    }

    const id = randomUUID();
    const publicId = randomUUID();
    const rows = await tx.$queryRaw<SourceRow[]>(Prisma.sql`
      INSERT INTO "flowcordia"."workflow_draft_source_file" (
        "id", "public_id", "draft_id", "function_id", "source_path", "export_name",
        "base_commit_sha", "base_blob_sha", "base_source_text", "base_source_sha256",
        "source_text", "source_sha256", "version", "created_by_actor_id",
        "updated_by_actor_id", "created_at", "updated_at"
      ) VALUES (
        ${id}, ${publicId}, ${input.draft.id}, ${input.identity.functionId},
        ${input.identity.sourcePath}, ${input.identity.exportName}, ${input.identity.baseCommitSha},
        ${input.identity.baseBlobSha}, ${input.sourceText}, ${baseSourceSha256},
        ${input.sourceText}, ${baseSourceSha256}, 1, ${input.actorId}, ${input.actorId}, ${now}, ${now}
      )
      ON CONFLICT ("draft_id", "source_path") DO NOTHING
      RETURNING ${sourceColumns()}
    `);
    const created = rows[0]
      ? decodeSource(rows[0])
      : await selectOne(
          tx,
          input.scope,
          Prisma.sql`
            d."public_id" = ${input.draft.publicId}
            AND s."source_path" = ${input.identity.sourcePath}
          `
        );
    if (!created) {
      throw new WorkflowDraftError(
        "draft_unavailable",
        "The repository source buffer could not be created or resumed safely.",
        true
      );
    }
    if (
      created.baseCommitSha !== input.identity.baseCommitSha ||
      created.baseBlobSha !== input.identity.baseBlobSha ||
      created.baseSourceSha256 !== baseSourceSha256
    ) {
      throw new WorkflowDraftError(
        "stale_source",
        "The repository source changed while the source buffer was being created."
      );
    }
    await appendAudit(tx, input.scope, created, {
      eventType: rows[0]
        ? "workflow_draft_source.started"
        : "workflow_draft_source.resumed",
      actorId: input.actorId,
      correlationId: input.correlationId,
      dedupeKey: `workflow-draft-source:${created.publicId}:${rows[0] ? "start" : "resume"}:${input.correlationId}`,
      payload: {
        publicId: created.publicId,
        draftPublicId: input.draft.publicId,
        functionId: input.identity.functionId,
        sourcePath: created.sourcePath,
        baseCommitSha: created.baseCommitSha,
        baseBlobSha: created.baseBlobSha,
        baseSourceSha256: created.baseSourceSha256,
        sourceSha256: created.sourceSha256,
        version: created.version.toString(),
      },
      occurredAt: now,
    });
    return { source: created, created: Boolean(rows[0]) };
  });
}

async function mutateWorkflowDraftSourceFile(input: {
  scope: WorkflowDraftScope;
  publicId: string;
  expectedVersion: bigint;
  sourceText: string | "RESET";
  actorId: string;
  correlationId: string;
  now?: Date;
}): Promise<WorkflowDraftSourceFileRecord> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const current = await selectOne(tx, input.scope, Prisma.sql`s."public_id" = ${input.publicId}`);
    if (!current) {
      throw new WorkflowDraftError(
        "draft_not_found",
        "The active repository source buffer was not found."
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new WorkflowDraftError(
        "draft_conflict",
        "The repository source buffer changed in another session. Refresh before editing it."
      );
    }
    const sourceText = input.sourceText === "RESET" ? current.baseSourceText : input.sourceText;
    const sourceSha256 = sourceTextSha256(sourceText);
    const rows = await tx.$queryRaw<SourceRow[]>(Prisma.sql`
      UPDATE "flowcordia"."workflow_draft_source_file" s
      SET
        "source_text" = ${sourceText},
        "source_sha256" = ${sourceSha256},
        "version" = s."version" + 1,
        "updated_by_actor_id" = ${input.actorId},
        "updated_at" = ${now}
      FROM "flowcordia"."workflow_draft" d
      WHERE d."id" = s."draft_id"
        AND ${scopePredicate(input.scope)}
        AND s."public_id" = ${input.publicId}
        AND s."version" = ${input.expectedVersion}
      RETURNING ${sourceColumns()}
    `);
    if (!rows[0]) {
      throw new WorkflowDraftError(
        "draft_conflict",
        "The repository source buffer changed in another session. Refresh before editing it."
      );
    }
    const updated = decodeSource(rows[0]);
    await appendAudit(tx, input.scope, updated, {
      eventType:
        input.sourceText === "RESET"
          ? "workflow_draft_source.reset"
          : "workflow_draft_source.edited",
      actorId: input.actorId,
      correlationId: input.correlationId,
      dedupeKey: `workflow-draft-source:${updated.publicId}:${input.sourceText === "RESET" ? "reset" : "edit"}:${input.correlationId}`,
      payload: {
        publicId: updated.publicId,
        sourcePath: updated.sourcePath,
        previousVersion: input.expectedVersion.toString(),
        version: updated.version.toString(),
        baseSourceSha256: updated.baseSourceSha256,
        sourceSha256: updated.sourceSha256,
        changed: isWorkflowDraftSourceChanged(updated),
      },
      occurredAt: now,
    });
    return updated;
  });
}

export async function updateWorkflowDraftSourceFile(input: {
  scope: WorkflowDraftScope;
  publicId: string;
  expectedVersion: bigint;
  sourceText: string;
  actorId: string;
  correlationId: string;
  now?: Date;
}): Promise<WorkflowDraftSourceFileRecord> {
  return mutateWorkflowDraftSourceFile(input);
}

export async function resetWorkflowDraftSourceFile(input: {
  scope: WorkflowDraftScope;
  publicId: string;
  expectedVersion: bigint;
  actorId: string;
  correlationId: string;
  now?: Date;
}): Promise<WorkflowDraftSourceFileRecord> {
  return mutateWorkflowDraftSourceFile({ ...input, sourceText: "RESET" });
}
