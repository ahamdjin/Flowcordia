import { randomUUID } from "node:crypto";
import { Prisma } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import type { ClaimedWorkflowIndexSync, WorkflowIndexScope } from "./types";

interface ClaimedRow {
  id: string;
  status: ClaimedWorkflowIndexSync["status"];
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

/** Claims only the just-requested row. It can never consume another tenant's queued sync. */
export async function claimRequestedWorkflowIndexSync(input: {
  syncId: string;
  scope: WorkflowIndexScope;
  expectedGeneration: bigint;
  workerId: string;
  leaseMs?: number;
  now?: Date;
}): Promise<ClaimedWorkflowIndexSync | null> {
  const leaseMs = input.leaseMs ?? 120_000;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 900_000) {
    throw new TypeError("Workflow index lease must be between 5 seconds and 15 minutes.");
  }
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);
  const lockToken = randomUUID();
  const rows = await prisma.$queryRaw<ClaimedRow[]>(Prisma.sql`
    UPDATE "flowcordia"."workflow_index_sync"
    SET
      "status" = 'RUNNING',
      "locked_by" = ${input.workerId},
      "lock_token" = ${lockToken},
      "lock_expires_at" = ${expiresAt},
      "started_at" = ${now},
      "updated_at" = ${now}
    WHERE "id" = ${input.syncId}
      AND "generation" = ${input.expectedGeneration}
      AND "status" IN ('PENDING', 'FAILED')
      AND ${scopePredicate(input.scope)}
    RETURNING
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
  `);
  return rows[0] ? { ...rows[0], scope: input.scope } : null;
}
