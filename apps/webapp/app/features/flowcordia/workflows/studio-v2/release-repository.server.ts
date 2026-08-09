import { createHash, randomUUID } from "node:crypto";
import { workflowSha256 } from "@flowcordia/control-plane";
import type { JsonObject } from "@flowcordia/workflow";
import { Prisma } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import {
  StudioV2ReleaseError,
  type StudioV2ReleaseRecord,
  type StudioV2ReleaseStatus,
} from "./release-contract";
import type { StudioV2PreparedRelease } from "./release-preparation";
import {
  validateStudioV2WorkspaceDocument,
  type StudioV2WorkspaceScope,
} from "./workspace-contract";

interface StudioV2ReleaseRow {
  id: string;
  publicId: string;
  workspaceId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  workspaceKey: string;
  workspaceVersion: bigint;
  documentJson: unknown;
  documentSha256: string;
  taskId: string;
  validationTaskId: string | null;
  exportName: string;
  generatedSource: string;
  sourceSha256: string;
  orderedNodeIds: unknown;
  triggerBinding: unknown;
  warnings: unknown;
  status: string;
  deploymentOperationId: string | null;
  deploymentId: string | null;
  failureMessage: string | null;
  stagedByActorId: string;
  deployedByActorId: string | null;
  stagedAt: Date;
  deployedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StudioV2WorkspaceStageRow {
  id: string;
  documentSha256: string;
  version: bigint;
  testedVersion: bigint | null;
  lastTestSucceeded: boolean | null;
}

interface WorkerDeploymentStatusRow {
  status: string;
}

function releaseColumns() {
  return Prisma.sql`
    "id",
    "public_id" AS "publicId",
    "workspace_id" AS "workspaceId",
    "organization_id" AS "organizationId",
    "project_id" AS "projectId",
    "environment_id" AS "environmentId",
    "workspace_key" AS "workspaceKey",
    "workspace_version" AS "workspaceVersion",
    "document_json" AS "documentJson",
    "document_sha256" AS "documentSha256",
    "task_id" AS "taskId",
    "validation_task_id" AS "validationTaskId",
    "export_name" AS "exportName",
    "generated_source" AS "generatedSource",
    "source_sha256" AS "sourceSha256",
    "ordered_node_ids" AS "orderedNodeIds",
    "trigger_binding" AS "triggerBinding",
    "warnings",
    "status",
    "deployment_operation_id" AS "deploymentOperationId",
    "deployment_id" AS "deploymentId",
    "failure_message" AS "failureMessage",
    "staged_by_actor_id" AS "stagedByActorId",
    "deployed_by_actor_id" AS "deployedByActorId",
    "staged_at" AS "stagedAt",
    "deployed_at" AS "deployedAt",
    "created_at" AS "createdAt",
    "updated_at" AS "updatedAt"
  `;
}

function scopePredicate(scope: StudioV2WorkspaceScope) {
  return Prisma.sql`
    "organization_id" = ${scope.organizationId}
    AND "project_id" = ${scope.projectId}
    AND "environment_id" = ${scope.environmentId}
    AND "workspace_key" = ${scope.workspaceKey}
  `;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isReleaseStatus(value: string): value is StudioV2ReleaseStatus {
  return ["STAGED", "DEPLOYING", "DEPLOYED", "FAILED"].includes(value);
}

function decodeRelease(row: StudioV2ReleaseRow): StudioV2ReleaseRecord {
  const document = validateStudioV2WorkspaceDocument(row.documentJson);
  const sourceSha256 = createHash("sha256").update(row.generatedSource).digest("hex");
  if (
    !document.success ||
    workflowSha256(document.workflow) !== row.documentSha256 ||
    sourceSha256 !== row.sourceSha256 ||
    !isStringArray(row.orderedNodeIds) ||
    !isStringArray(row.warnings) ||
    (row.triggerBinding !== null && !isJsonObject(row.triggerBinding)) ||
    !isReleaseStatus(row.status)
  ) {
    throw new StudioV2ReleaseError(
      "corrupt_release",
      "The stored Studio V2 release no longer matches its immutable integrity contract."
    );
  }

  return {
    id: row.id,
    publicId: row.publicId,
    workspaceId: row.workspaceId,
    scope: {
      organizationId: row.organizationId,
      projectId: row.projectId,
      environmentId: row.environmentId,
      workspaceKey: row.workspaceKey,
    },
    workspaceVersion: row.workspaceVersion,
    document: document.workflow,
    documentSha256: row.documentSha256,
    taskId: row.taskId,
    validationTaskId: row.validationTaskId,
    exportName: row.exportName,
    generatedSource: row.generatedSource,
    sourceSha256: row.sourceSha256,
    orderedNodeIds: row.orderedNodeIds,
    triggerBinding: row.triggerBinding,
    warnings: row.warnings,
    status: row.status,
    deploymentOperationId: row.deploymentOperationId,
    deploymentId: row.deploymentId,
    failureMessage: row.failureMessage,
    stagedByActorId: row.stagedByActorId,
    deployedByActorId: row.deployedByActorId,
    stagedAt: row.stagedAt,
    deployedAt: row.deployedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function selectLatestRelease(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  scope: StudioV2WorkspaceScope
): Promise<StudioV2ReleaseRecord | null> {
  const rows = await client.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
    SELECT ${releaseColumns()}
    FROM "flowcordia"."studio_v2_release"
    WHERE ${scopePredicate(scope)}
    ORDER BY "workspace_version" DESC
    LIMIT 1
  `);
  return rows[0] ? decodeRelease(rows[0]) : null;
}

async function selectReleaseByPublicId(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  scope: StudioV2WorkspaceScope,
  publicId: string,
  forUpdate = false
): Promise<StudioV2ReleaseRecord | null> {
  const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
  const rows = await client.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
    SELECT ${releaseColumns()}
    FROM "flowcordia"."studio_v2_release"
    WHERE ${scopePredicate(scope)}
      AND "public_id" = ${publicId}
    LIMIT 1
    ${lock}
  `);
  return rows[0] ? decodeRelease(rows[0]) : null;
}

async function appendReleaseEvent(
  tx: Prisma.TransactionClient,
  input: {
    release: StudioV2ReleaseRecord;
    eventType: string;
    actorId: string;
    payload: Record<string, unknown>;
    occurredAt: Date;
  }
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "flowcordia"."studio_v2_workspace_event" (
      "id", "workspace_id", "organization_id", "project_id", "environment_id",
      "event_type", "actor_id", "payload", "occurred_at", "created_at"
    ) VALUES (
      ${randomUUID()}, ${input.release.workspaceId}, ${input.release.scope.organizationId},
      ${input.release.scope.projectId}, ${input.release.scope.environmentId},
      ${input.eventType}, ${input.actorId},
      CAST(${JSON.stringify(input.payload)} AS JSONB), ${input.occurredAt}, ${input.occurredAt}
    )
  `);
}

export async function getLatestStudioV2Release(
  scope: StudioV2WorkspaceScope
): Promise<StudioV2ReleaseRecord | null> {
  return selectLatestRelease(prisma, scope);
}

export async function listStudioV2Releases(
  scope: StudioV2WorkspaceScope,
  limit = 20
): Promise<StudioV2ReleaseRecord[]> {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = await prisma.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
    SELECT ${releaseColumns()}
    FROM "flowcordia"."studio_v2_release"
    WHERE ${scopePredicate(scope)}
    ORDER BY "workspace_version" DESC
    LIMIT ${boundedLimit}
  `);
  return rows.map(decodeRelease);
}

export async function recordStudioV2ReleaseRollback(input: {
  release: StudioV2ReleaseRecord;
  actorId: string;
  replacedDeploymentId: string | null;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await prisma.$transaction((tx) =>
    appendReleaseEvent(tx, {
      release: input.release,
      eventType: "studio_v2_workspace.rolled_back",
      actorId: input.actorId,
      occurredAt: now,
      payload: {
        releasePublicId: input.release.publicId,
        workspaceVersion: input.release.workspaceVersion.toString(),
        deploymentId: input.release.deploymentId,
        replacedDeploymentId: input.replacedDeploymentId,
      },
    })
  );
}

export async function getStudioV2ReleaseByPublicId(
  scope: StudioV2WorkspaceScope,
  publicId: string
): Promise<StudioV2ReleaseRecord | null> {
  return selectReleaseByPublicId(prisma, scope, publicId);
}

export async function getStudioV2ReleaseByPublicIdAcrossScopes(
  publicId: string
): Promise<StudioV2ReleaseRecord | null> {
  const rows = await prisma.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
    SELECT ${releaseColumns()}
    FROM "flowcordia"."studio_v2_release"
    WHERE "public_id" = ${publicId}
    LIMIT 1
  `);
  return rows[0] ? decodeRelease(rows[0]) : null;
}

export async function stageStudioV2ReleaseRecord(input: {
  prepared: StudioV2PreparedRelease;
  actorId: string;
  now?: Date;
}): Promise<{ release: StudioV2ReleaseRecord; created: boolean }> {
  const now = input.now ?? new Date();
  const { workspace, artifact, sourceSha256, triggerBinding } = input.prepared;

  return prisma.$transaction(async (tx) => {
    const workspaceRows = await tx.$queryRaw<StudioV2WorkspaceStageRow[]>(Prisma.sql`
      SELECT
        "id",
        "document_sha256" AS "documentSha256",
        "version",
        "tested_version" AS "testedVersion",
        "last_test_succeeded" AS "lastTestSucceeded"
      FROM "flowcordia"."studio_v2_workspace"
      WHERE ${scopePredicate(workspace.scope)}
      LIMIT 1
      FOR UPDATE
    `);
    const locked = workspaceRows[0];
    if (!locked) {
      throw new StudioV2ReleaseError("release_not_found", "The Studio V2 workspace was not found.");
    }
    if (
      locked.id !== workspace.id ||
      locked.version !== workspace.version ||
      locked.documentSha256 !== workspace.documentSha256
    ) {
      throw new StudioV2ReleaseError(
        "release_conflict",
        "The Studio V2 workspace changed while the release was compiling. Reload and stage again."
      );
    }
    if (locked.testedVersion !== locked.version || locked.lastTestSucceeded !== true) {
      throw new StudioV2ReleaseError(
        "release_not_tested",
        "The current Studio V2 workspace version must pass structural testing before it can be staged."
      );
    }

    const existingRows = await tx.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
      SELECT ${releaseColumns()}
      FROM "flowcordia"."studio_v2_release"
      WHERE "workspace_id" = ${workspace.id}
        AND "workspace_version" = ${workspace.version}
      LIMIT 1
    `);
    if (existingRows[0]) {
      const existing = decodeRelease(existingRows[0]);
      if (
        existing.documentSha256 !== workspace.documentSha256 ||
        existing.sourceSha256 !== sourceSha256 ||
        existing.taskId !== artifact.taskId ||
        existing.exportName !== artifact.exportName
      ) {
        throw new StudioV2ReleaseError(
          "corrupt_release",
          "An existing staged release for this workspace version does not match the compiled snapshot."
        );
      }
      return { release: existing, created: false };
    }

    const id = randomUUID();
    const publicId = randomUUID();
    const triggerBindingSql =
      triggerBinding === null
        ? Prisma.sql`NULL`
        : Prisma.sql`CAST(${JSON.stringify(triggerBinding)} AS JSONB)`;
    const rows = await tx.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
      INSERT INTO "flowcordia"."studio_v2_release" (
        "id", "public_id", "workspace_id", "organization_id", "project_id",
        "environment_id", "workspace_key", "workspace_version", "document_json",
        "document_sha256", "task_id", "validation_task_id", "export_name",
        "generated_source", "source_sha256", "ordered_node_ids", "trigger_binding",
        "warnings", "status", "deployment_operation_id", "deployment_id", "failure_message",
        "staged_by_actor_id", "deployed_by_actor_id", "staged_at", "deployed_at",
        "created_at", "updated_at"
      ) VALUES (
        ${id}, ${publicId}, ${workspace.id}, ${workspace.scope.organizationId},
        ${workspace.scope.projectId}, ${workspace.scope.environmentId},
        ${workspace.scope.workspaceKey}, ${workspace.version},
        CAST(${JSON.stringify(workspace.document)} AS JSONB), ${workspace.documentSha256},
        ${artifact.taskId}, ${artifact.validationTaskId}, ${artifact.exportName},
        ${artifact.source}, ${sourceSha256},
        CAST(${JSON.stringify(artifact.orderedNodeIds)} AS JSONB), ${triggerBindingSql},
        CAST(${JSON.stringify(artifact.warnings)} AS JSONB), 'STAGED', NULL, NULL, NULL,
        ${input.actorId}, NULL, ${now}, NULL, ${now}, ${now}
      )
      RETURNING ${releaseColumns()}
    `);
    const release = decodeRelease(rows[0]!);

    await appendReleaseEvent(tx, {
      release,
      eventType: "studio_v2_workspace.staged",
      actorId: input.actorId,
      occurredAt: now,
      payload: {
        releasePublicId: release.publicId,
        workspaceVersion: release.workspaceVersion.toString(),
        documentSha256: release.documentSha256,
        sourceSha256: release.sourceSha256,
        taskId: release.taskId,
      },
    });

    return { release, created: true };
  });
}

export async function beginStudioV2ReleaseDeployment(input: {
  scope: StudioV2WorkspaceScope;
  releasePublicId: string;
  operationId: string;
  actorId: string;
  now?: Date;
}): Promise<StudioV2ReleaseRecord> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const release = await selectReleaseByPublicId(tx, input.scope, input.releasePublicId, true);
    if (!release) {
      throw new StudioV2ReleaseError(
        "release_not_found",
        "The staged Studio V2 release was not found."
      );
    }
    if (release.status === "DEPLOYED") return release;
    if (release.status === "DEPLOYING") {
      throw new StudioV2ReleaseError(
        "release_conflict",
        "This Studio V2 release already has an active deployment.",
        true
      );
    }

    const rows = await tx.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
      UPDATE "flowcordia"."studio_v2_release"
      SET
        "status" = 'DEPLOYING',
        "deployment_operation_id" = ${input.operationId},
        "deployment_id" = NULL,
        "failure_message" = NULL,
        "deployed_by_actor_id" = ${input.actorId},
        "deployed_at" = NULL,
        "updated_at" = ${now}
      WHERE "id" = ${release.id}
      RETURNING ${releaseColumns()}
    `);
    const deploying = decodeRelease(rows[0]!);
    await appendReleaseEvent(tx, {
      release: deploying,
      eventType: "studio_v2_workspace.deployment_started",
      actorId: input.actorId,
      occurredAt: now,
      payload: {
        releasePublicId: deploying.publicId,
        workspaceVersion: deploying.workspaceVersion.toString(),
        sourceSha256: deploying.sourceSha256,
      },
    });
    return deploying;
  });
}

export async function attachStudioV2ReleaseDeployment(input: {
  releaseId: string;
  operationId: string;
  deploymentId: string;
  now?: Date;
}): Promise<StudioV2ReleaseRecord> {
  const now = input.now ?? new Date();
  const rows = await prisma.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
    UPDATE "flowcordia"."studio_v2_release"
    SET "deployment_id" = ${input.deploymentId}, "updated_at" = ${now}
    WHERE "id" = ${input.releaseId}
      AND "status" = 'DEPLOYING'
      AND "deployment_operation_id" = ${input.operationId}
    RETURNING ${releaseColumns()}
  `);
  if (!rows[0]) {
    throw new StudioV2ReleaseError(
      "release_conflict",
      "The Studio V2 deployment operation no longer owns this release.",
      true
    );
  }
  return decodeRelease(rows[0]);
}

export async function failStudioV2ReleaseDeployment(input: {
  releaseId: string;
  operationId: string;
  message: string;
  now?: Date;
}): Promise<StudioV2ReleaseRecord | null> {
  const now = input.now ?? new Date();
  const rows = await prisma.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
    UPDATE "flowcordia"."studio_v2_release"
    SET
      "status" = 'FAILED',
      "failure_message" = ${input.message.slice(0, 2000)},
      "deployed_at" = NULL,
      "updated_at" = ${now}
    WHERE "id" = ${input.releaseId}
      AND "status" = 'DEPLOYING'
      AND "deployment_operation_id" = ${input.operationId}
    RETURNING ${releaseColumns()}
  `);
  return rows[0] ? decodeRelease(rows[0]) : null;
}

export async function reconcileStudioV2ReleaseDeployment(
  release: StudioV2ReleaseRecord,
  now = new Date()
): Promise<StudioV2ReleaseRecord> {
  if (release.status !== "DEPLOYING" || !release.deploymentId) return release;
  const deploymentRows = await prisma.$queryRaw<WorkerDeploymentStatusRow[]>(Prisma.sql`
    SELECT "status"
    FROM "public"."WorkerDeployment"
    WHERE "id" = ${release.deploymentId}
    LIMIT 1
  `);
  const status = deploymentRows[0]?.status;
  if (!status) {
    throw new StudioV2ReleaseError(
      "corrupt_release",
      "The Studio V2 release references a deployment that no longer exists."
    );
  }
  if (status === "DEPLOYED") {
    const rows = await prisma.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
      UPDATE "flowcordia"."studio_v2_release"
      SET "status" = 'DEPLOYED', "failure_message" = NULL,
          "deployed_at" = ${now}, "updated_at" = ${now}
      WHERE "id" = ${release.id} AND "status" = 'DEPLOYING'
      RETURNING ${releaseColumns()}
    `);
    return rows[0] ? decodeRelease(rows[0]) : release;
  }
  if (["FAILED", "CANCELED", "TIMED_OUT"].includes(status)) {
    const rows = await prisma.$queryRaw<StudioV2ReleaseRow[]>(Prisma.sql`
      UPDATE "flowcordia"."studio_v2_release"
      SET "status" = 'FAILED',
          "failure_message" = ${`Trigger.dev deployment ended with status ${status}.`},
          "deployed_at" = NULL, "updated_at" = ${now}
      WHERE "id" = ${release.id} AND "status" = 'DEPLOYING'
      RETURNING ${releaseColumns()}
    `);
    return rows[0] ? decodeRelease(rows[0]) : release;
  }
  return release;
}
