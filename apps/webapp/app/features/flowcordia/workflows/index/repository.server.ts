import { randomUUID } from "node:crypto";
import { Prisma } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import type {
  ClaimedWorkflowIndexSync,
  WorkflowIndexAuditInput,
  WorkflowIndexEntryInput,
  WorkflowIndexEntryRecord,
  WorkflowIndexScope,
  WorkflowIndexSyncReason,
  WorkflowIndexSyncRecord,
} from "./types";

const MAX_ERROR_MESSAGE = 1_000;
const MAX_LIST_ENTRIES = 500;

interface SyncRow {
  id: string;
  status: WorkflowIndexSyncRecord["status"];
  reason: string;
  requestedCommitSha: string | null;
  observedCommitSha: string | null;
  generation: bigint;
  entryCount: number;
  validCount: number;
  invalidCount: number;
  lockedBy: string | null;
  lockToken: string | null;
  lockExpiresAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  requestedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ClaimedSyncRow extends SyncRow {
  organizationId: string;
  projectId: string;
  githubAppInstallationId: string;
  appInstallationId: bigint;
  repositoryId: string;
  repositoryGithubId: bigint;
  repositoryOwner: string;
  repositoryName: string;
  branch: string;
}

interface EntryRow {
  id: string;
  workflowId: string;
  workflowPath: string;
  status: WorkflowIndexEntryRecord["status"];
  name: string | null;
  description: string | null;
  schemaVersion: string | null;
  nodeCount: number | null;
  edgeCount: number | null;
  sourceCommitSha: string;
  sourceBlobSha: string;
  canonicalSha256: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  indexedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function syncColumns() {
  return Prisma.sql`
    "id",
    "status",
    "reason",
    "requested_commit_sha" AS "requestedCommitSha",
    "observed_commit_sha" AS "observedCommitSha",
    "generation",
    "entry_count" AS "entryCount",
    "valid_count" AS "validCount",
    "invalid_count" AS "invalidCount",
    "locked_by" AS "lockedBy",
    "lock_token" AS "lockToken",
    "lock_expires_at" AS "lockExpiresAt",
    "last_error_code" AS "lastErrorCode",
    "last_error_message" AS "lastErrorMessage",
    "requested_at" AS "requestedAt",
    "started_at" AS "startedAt",
    "completed_at" AS "completedAt",
    "created_at" AS "createdAt",
    "updated_at" AS "updatedAt"
  `;
}

function entryColumns() {
  return Prisma.sql`
    "id",
    "workflow_id" AS "workflowId",
    "workflow_path" AS "workflowPath",
    "status",
    "name",
    "description",
    "schema_version" AS "schemaVersion",
    "node_count" AS "nodeCount",
    "edge_count" AS "edgeCount",
    "source_commit_sha" AS "sourceCommitSha",
    "source_blob_sha" AS "sourceBlobSha",
    "canonical_sha256" AS "canonicalSha256",
    "failure_code" AS "failureCode",
    "failure_message" AS "failureMessage",
    "indexed_at" AS "indexedAt",
    "created_at" AS "createdAt",
    "updated_at" AS "updatedAt"
  `;
}

function toSync(row: SyncRow): WorkflowIndexSyncRecord {
  return { ...row };
}

function toEntry(row: EntryRow): WorkflowIndexEntryRecord {
  return { ...row };
}

function scopePredicate(scope: WorkflowIndexScope) {
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

async function appendAudit(
  tx: Prisma.TransactionClient,
  scope: WorkflowIndexScope,
  audit: WorkflowIndexAuditInput
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "flowcordia"."workflow_index_audit_event" (
      "id", "organization_id", "project_id", "repository_id", "event_type", "actor_id",
      "correlation_id", "dedupe_key", "payload", "occurred_at", "created_at"
    ) VALUES (
      ${randomUUID()}, ${scope.tenantId}, ${scope.projectId}, ${scope.repositoryId},
      ${audit.eventType}, ${audit.actorId}, ${audit.correlationId}, ${audit.dedupeKey},
      CAST(${JSON.stringify(audit.payload)} AS JSONB), ${audit.occurredAt}, ${audit.occurredAt}
    )
    ON CONFLICT ("dedupe_key") DO NOTHING
  `);
}

export async function getWorkflowIndexSync(
  scope: WorkflowIndexScope
): Promise<WorkflowIndexSyncRecord | null> {
  const rows = await prisma.$queryRaw<SyncRow[]>(Prisma.sql`
    SELECT ${syncColumns()}
    FROM "flowcordia"."workflow_index_sync"
    WHERE ${scopePredicate(scope)}
    LIMIT 1
  `);
  return rows[0] ? toSync(rows[0]) : null;
}

export async function listWorkflowIndexEntries(
  scope: WorkflowIndexScope,
  limit = MAX_LIST_ENTRIES
): Promise<WorkflowIndexEntryRecord[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_ENTRIES) {
    throw new TypeError("Workflow index list limit must be between 1 and 500.");
  }
  const rows = await prisma.$queryRaw<EntryRow[]>(Prisma.sql`
    SELECT ${entryColumns()}
    FROM "flowcordia"."workflow_index_entry"
    WHERE ${scopePredicate(scope)}
    ORDER BY "workflow_id" ASC
    LIMIT ${limit}
  `);
  return rows.map(toEntry);
}

export async function getWorkflowIndexEntry(
  scope: WorkflowIndexScope,
  workflowId: string
): Promise<WorkflowIndexEntryRecord | null> {
  const rows = await prisma.$queryRaw<EntryRow[]>(Prisma.sql`
    SELECT ${entryColumns()}
    FROM "flowcordia"."workflow_index_entry"
    WHERE ${scopePredicate(scope)} AND "workflow_id" = ${workflowId}
    LIMIT 1
  `);
  return rows[0] ? toEntry(rows[0]) : null;
}

export async function requestWorkflowIndexSync(input: {
  scope: WorkflowIndexScope;
  reason: WorkflowIndexSyncReason;
  requestedCommitSha: string | null;
  actorId: string;
  correlationId: string;
  now?: Date;
}): Promise<WorkflowIndexSyncRecord> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<SyncRow[]>(Prisma.sql`
      INSERT INTO "flowcordia"."workflow_index_sync" (
        "id", "organization_id", "project_id", "github_app_installation_id",
        "app_installation_id", "repository_id", "repository_github_id", "repository_owner",
        "repository_name", "branch", "status", "reason", "requested_commit_sha", "generation",
        "requested_at", "created_at", "updated_at"
      ) VALUES (
        ${randomUUID()}, ${input.scope.tenantId}, ${input.scope.projectId},
        ${input.scope.githubAppInstallationId}, ${BigInt(input.scope.installationId)},
        ${input.scope.repositoryId}, ${BigInt(input.scope.repositoryGithubId)},
        ${input.scope.repository.owner}, ${input.scope.repository.name},
        ${input.scope.repository.branch}, 'PENDING', ${input.reason}, ${input.requestedCommitSha}, 1,
        ${now}, ${now}, ${now}
      )
      ON CONFLICT ("project_id", "repository_id") DO UPDATE SET
        "organization_id" = EXCLUDED."organization_id",
        "github_app_installation_id" = EXCLUDED."github_app_installation_id",
        "app_installation_id" = EXCLUDED."app_installation_id",
        "repository_github_id" = EXCLUDED."repository_github_id",
        "repository_owner" = EXCLUDED."repository_owner",
        "repository_name" = EXCLUDED."repository_name",
        "branch" = EXCLUDED."branch",
        "status" = CASE
          WHEN "workflow_index_sync"."status" = 'RUNNING'
            AND "workflow_index_sync"."lock_expires_at" > ${now}
          THEN 'RUNNING'
          ELSE 'PENDING'
        END,
        "reason" = EXCLUDED."reason",
        "requested_commit_sha" = EXCLUDED."requested_commit_sha",
        "generation" = "workflow_index_sync"."generation" + 1,
        "locked_by" = CASE
          WHEN "workflow_index_sync"."status" = 'RUNNING'
            AND "workflow_index_sync"."lock_expires_at" > ${now}
          THEN "workflow_index_sync"."locked_by"
          ELSE NULL
        END,
        "lock_token" = CASE
          WHEN "workflow_index_sync"."status" = 'RUNNING'
            AND "workflow_index_sync"."lock_expires_at" > ${now}
          THEN "workflow_index_sync"."lock_token"
          ELSE NULL
        END,
        "lock_expires_at" = CASE
          WHEN "workflow_index_sync"."status" = 'RUNNING'
            AND "workflow_index_sync"."lock_expires_at" > ${now}
          THEN "workflow_index_sync"."lock_expires_at"
          ELSE NULL
        END,
        "last_error_code" = NULL,
        "last_error_message" = NULL,
        "requested_at" = ${now},
        "updated_at" = ${now}
      RETURNING ${syncColumns()}
    `);
    const row = rows[0];
    if (!row) throw new Error("Workflow index sync request was not persisted.");
    await appendAudit(tx, input.scope, {
      eventType: "workflow_index.sync_requested",
      actorId: input.actorId,
      correlationId: input.correlationId,
      dedupeKey: `${row.id}:requested:${row.generation.toString()}`,
      payload: {
        reason: input.reason,
        requestedCommitSha: input.requestedCommitSha,
        generation: row.generation.toString(),
      },
      occurredAt: now,
    });
    return toSync(row);
  });
}

export async function claimWorkflowIndexSync(input: {
  workerId: string;
  leaseMs: number;
  now?: Date;
}): Promise<ClaimedWorkflowIndexSync | null> {
  if (!input.workerId || input.workerId.length > 255) throw new TypeError("Worker ID is invalid.");
  if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 5_000 || input.leaseMs > 900_000) {
    throw new TypeError("Workflow index lease must be between 5 seconds and 15 minutes.");
  }
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + input.leaseMs);
  const lockToken = randomUUID();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedSyncRow[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id"
        FROM "flowcordia"."workflow_index_sync"
        WHERE (
          "status" = 'PENDING'
          OR ("status" = 'RUNNING' AND "lock_expires_at" <= ${now})
        )
        ORDER BY "requested_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "flowcordia"."workflow_index_sync" AS sync
      SET
        "status" = 'RUNNING',
        "locked_by" = ${input.workerId},
        "lock_token" = ${lockToken},
        "lock_expires_at" = ${expiresAt},
        "started_at" = ${now},
        "updated_at" = ${now}
      FROM candidate
      WHERE sync."id" = candidate."id"
      RETURNING
        sync."organization_id" AS "organizationId",
        sync."project_id" AS "projectId",
        sync."github_app_installation_id" AS "githubAppInstallationId",
        sync."app_installation_id" AS "appInstallationId",
        sync."repository_id" AS "repositoryId",
        sync."repository_github_id" AS "repositoryGithubId",
        sync."repository_owner" AS "repositoryOwner",
        sync."repository_name" AS "repositoryName",
        sync."branch",
        ${syncColumns()}
    `);
    const row = rows[0];
    if (!row) return null;
    const scope: WorkflowIndexScope = {
      tenantId: row.organizationId,
      projectId: row.projectId,
      githubAppInstallationId: row.githubAppInstallationId,
      installationId: Number(row.appInstallationId),
      repositoryId: row.repositoryId,
      repositoryGithubId: row.repositoryGithubId.toString(),
      repository: {
        owner: row.repositoryOwner,
        name: row.repositoryName,
        branch: row.branch,
      },
    };
    if (!Number.isSafeInteger(scope.installationId) || scope.installationId <= 0) {
      throw new Error("Claimed workflow index installation ID is unsafe.");
    }
    await appendAudit(tx, scope, {
      eventType: "workflow_index.sync_started",
      actorId: `worker:${input.workerId}`,
      correlationId: lockToken,
      dedupeKey: `${row.id}:started:${row.generation.toString()}:${lockToken}`,
      payload: { generation: row.generation.toString(), leaseExpiresAt: expiresAt.toISOString() },
      occurredAt: now,
    });
    return { ...toSync(row), scope };
  });
}

export async function completeWorkflowIndexSync(input: {
  claim: ClaimedWorkflowIndexSync;
  observedCommitSha: string;
  entries: readonly WorkflowIndexEntryInput[];
  now?: Date;
}): Promise<WorkflowIndexSyncRecord> {
  const now = input.now ?? new Date();
  const validCount = input.entries.filter((entry) => entry.status === "VALID").length;
  const invalidCount = input.entries.length - validCount;
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "flowcordia"."workflow_index_sync"
      WHERE "id" = ${input.claim.id}
        AND "generation" = ${input.claim.generation}
        AND "status" = 'RUNNING'
        AND "lock_token" = ${input.claim.lockToken}
        AND ${scopePredicate(input.claim.scope)}
      FOR UPDATE
    `);
    if (!locked[0]) {
      throw new Error("Workflow index lease or generation changed before commit.");
    }

    for (const entry of input.entries) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "flowcordia"."workflow_index_entry" (
          "id", "organization_id", "project_id", "github_app_installation_id",
          "app_installation_id", "repository_id", "repository_github_id", "repository_owner",
          "repository_name", "branch", "workflow_id", "workflow_path", "status", "name",
          "description", "schema_version", "node_count", "edge_count", "source_commit_sha",
          "source_blob_sha", "canonical_sha256", "failure_code", "failure_message", "indexed_at",
          "created_at", "updated_at"
        ) VALUES (
          ${randomUUID()}, ${input.claim.scope.tenantId}, ${input.claim.scope.projectId},
          ${input.claim.scope.githubAppInstallationId}, ${BigInt(input.claim.scope.installationId)},
          ${input.claim.scope.repositoryId}, ${BigInt(input.claim.scope.repositoryGithubId)},
          ${input.claim.scope.repository.owner}, ${input.claim.scope.repository.name},
          ${input.claim.scope.repository.branch}, ${entry.workflowId}, ${entry.workflowPath},
          ${entry.status}, ${entry.name}, ${entry.description}, ${entry.schemaVersion},
          ${entry.nodeCount}, ${entry.edgeCount}, ${entry.sourceCommitSha}, ${entry.sourceBlobSha},
          ${entry.canonicalSha256}, ${entry.failureCode}, ${entry.failureMessage}, ${entry.indexedAt},
          ${now}, ${now}
        )
        ON CONFLICT ("project_id", "repository_id", "workflow_path") DO UPDATE SET
          "organization_id" = EXCLUDED."organization_id",
          "github_app_installation_id" = EXCLUDED."github_app_installation_id",
          "app_installation_id" = EXCLUDED."app_installation_id",
          "repository_github_id" = EXCLUDED."repository_github_id",
          "repository_owner" = EXCLUDED."repository_owner",
          "repository_name" = EXCLUDED."repository_name",
          "branch" = EXCLUDED."branch",
          "workflow_id" = EXCLUDED."workflow_id",
          "status" = EXCLUDED."status",
          "name" = EXCLUDED."name",
          "description" = EXCLUDED."description",
          "schema_version" = EXCLUDED."schema_version",
          "node_count" = EXCLUDED."node_count",
          "edge_count" = EXCLUDED."edge_count",
          "source_commit_sha" = EXCLUDED."source_commit_sha",
          "source_blob_sha" = EXCLUDED."source_blob_sha",
          "canonical_sha256" = EXCLUDED."canonical_sha256",
          "failure_code" = EXCLUDED."failure_code",
          "failure_message" = EXCLUDED."failure_message",
          "indexed_at" = EXCLUDED."indexed_at",
          "updated_at" = EXCLUDED."updated_at"
      `);
    }

    if (input.entries.length === 0) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "flowcordia"."workflow_index_entry"
        WHERE ${scopePredicate(input.claim.scope)}
      `);
    } else {
      const paths = Prisma.join(input.entries.map((entry) => Prisma.sql`${entry.workflowPath}`));
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "flowcordia"."workflow_index_entry"
        WHERE ${scopePredicate(input.claim.scope)}
          AND "workflow_path" NOT IN (${paths})
      `);
    }

    const rows = await tx.$queryRaw<SyncRow[]>(Prisma.sql`
      UPDATE "flowcordia"."workflow_index_sync"
      SET
        "status" = 'IDLE',
        "observed_commit_sha" = ${input.observedCommitSha},
        "entry_count" = ${input.entries.length},
        "valid_count" = ${validCount},
        "invalid_count" = ${invalidCount},
        "locked_by" = NULL,
        "lock_token" = NULL,
        "lock_expires_at" = NULL,
        "last_error_code" = NULL,
        "last_error_message" = NULL,
        "completed_at" = ${now},
        "updated_at" = ${now}
      WHERE "id" = ${input.claim.id}
        AND "generation" = ${input.claim.generation}
        AND "lock_token" = ${input.claim.lockToken}
      RETURNING ${syncColumns()}
    `);
    const row = rows[0];
    if (!row) throw new Error("Workflow index completion lost its lease.");
    await appendAudit(tx, input.claim.scope, {
      eventType: "workflow_index.sync_completed",
      actorId: `worker:${input.claim.lockedBy ?? "unknown"}`,
      correlationId: input.claim.lockToken ?? input.claim.id,
      dedupeKey: `${input.claim.id}:completed:${input.claim.generation.toString()}`,
      payload: {
        observedCommitSha: input.observedCommitSha,
        entryCount: input.entries.length,
        validCount,
        invalidCount,
      },
      occurredAt: now,
    });
    return toSync(row);
  });
}

export async function failWorkflowIndexSync(input: {
  claim: ClaimedWorkflowIndexSync;
  errorCode: string;
  errorMessage: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const message = input.errorMessage.slice(0, MAX_ERROR_MESSAGE);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRaw(Prisma.sql`
      UPDATE "flowcordia"."workflow_index_sync"
      SET
        "status" = 'FAILED',
        "locked_by" = NULL,
        "lock_token" = NULL,
        "lock_expires_at" = NULL,
        "last_error_code" = ${input.errorCode.slice(0, 100)},
        "last_error_message" = ${message},
        "completed_at" = ${now},
        "updated_at" = ${now}
      WHERE "id" = ${input.claim.id}
        AND "generation" = ${input.claim.generation}
        AND "lock_token" = ${input.claim.lockToken}
        AND ${scopePredicate(input.claim.scope)}
    `);
    if (updated === 0) return;
    await appendAudit(tx, input.claim.scope, {
      eventType: "workflow_index.sync_failed",
      actorId: `worker:${input.claim.lockedBy ?? "unknown"}`,
      correlationId: input.claim.lockToken ?? input.claim.id,
      dedupeKey: `${input.claim.id}:failed:${input.claim.generation.toString()}`,
      payload: { errorCode: input.errorCode.slice(0, 100), errorMessage: message },
      occurredAt: now,
    });
  });
}

export type WorkflowIndexWebhookInsertResult =
  | { status: "inserted" }
  | { status: "duplicate" }
  | { status: "mismatch" };

export async function insertWorkflowIndexWebhookDelivery(input: {
  deliveryId: string;
  payloadHash: string;
  appInstallationId: number;
  repositoryGithubId: string;
  ref: string | null;
  afterSha: string | null;
  receivedAt: Date;
}): Promise<WorkflowIndexWebhookInsertResult> {
  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw(Prisma.sql`
      INSERT INTO "flowcordia"."workflow_index_webhook_delivery" (
        "delivery_id", "payload_hash", "event_name", "app_installation_id",
        "repository_github_id", "ref", "after_sha", "status", "received_at", "created_at"
      ) VALUES (
        ${input.deliveryId}, ${input.payloadHash}, 'push', ${BigInt(input.appInstallationId)},
        ${BigInt(input.repositoryGithubId)}, ${input.ref}, ${input.afterSha}, 'RECEIVED',
        ${input.receivedAt}, ${input.receivedAt}
      )
      ON CONFLICT ("delivery_id") DO NOTHING
    `);
    if (inserted > 0) return { status: "inserted" };
    const existing = await tx.$queryRaw<Array<{ payloadHash: string }>>(Prisma.sql`
      SELECT "payload_hash" AS "payloadHash"
      FROM "flowcordia"."workflow_index_webhook_delivery"
      WHERE "delivery_id" = ${input.deliveryId}
      LIMIT 1
    `);
    return existing[0]?.payloadHash === input.payloadHash
      ? { status: "duplicate" }
      : { status: "mismatch" };
  });
}

export async function completeWorkflowIndexWebhookDelivery(input: {
  deliveryId: string;
  status: "SCHEDULED" | "IGNORED" | "FAILED";
  failureCode?: string | null;
  completedAt?: Date;
}): Promise<void> {
  const completedAt = input.completedAt ?? new Date();
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "flowcordia"."workflow_index_webhook_delivery"
    SET
      "status" = ${input.status},
      "failure_code" = ${input.failureCode ?? null},
      "completed_at" = ${completedAt}
    WHERE "delivery_id" = ${input.deliveryId}
  `);
}
