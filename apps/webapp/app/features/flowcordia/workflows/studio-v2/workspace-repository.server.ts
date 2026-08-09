import { randomUUID } from "node:crypto";
import { workflowSha256 } from "@flowcordia/control-plane";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { Prisma } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import {
  StudioV2WorkspaceError,
  validateStudioV2WorkspaceDocument,
  type StudioV2WorkspaceRecord,
  type StudioV2WorkspaceScope,
} from "./workspace-contract";

interface StudioV2WorkspaceRow {
  id: string;
  publicId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  workspaceKey: string;
  documentJson: unknown;
  documentSha256: string;
  version: bigint;
  testedVersion: bigint | null;
  lastTestSucceeded: boolean | null;
  createdByActorId: string;
  updatedByActorId: string;
  createdAt: Date;
  updatedAt: Date;
}

function workspaceColumns() {
  return Prisma.sql`
    "id",
    "public_id" AS "publicId",
    "organization_id" AS "organizationId",
    "project_id" AS "projectId",
    "environment_id" AS "environmentId",
    "workspace_key" AS "workspaceKey",
    "document_json" AS "documentJson",
    "document_sha256" AS "documentSha256",
    "version",
    "tested_version" AS "testedVersion",
    "last_test_succeeded" AS "lastTestSucceeded",
    "created_by_actor_id" AS "createdByActorId",
    "updated_by_actor_id" AS "updatedByActorId",
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

function decodeWorkspace(row: StudioV2WorkspaceRow): StudioV2WorkspaceRecord {
  const validation = validateStudioV2WorkspaceDocument(row.documentJson);
  if (!validation.success) {
    throw new StudioV2WorkspaceError(
      "corrupt_workspace",
      "The stored Studio V2 workspace no longer satisfies the canonical workflow contract."
    );
  }
  if (workflowSha256(validation.workflow) !== row.documentSha256) {
    throw new StudioV2WorkspaceError(
      "corrupt_workspace",
      "The stored Studio V2 workspace does not match its integrity hash."
    );
  }
  return {
    id: row.id,
    publicId: row.publicId,
    scope: {
      organizationId: row.organizationId,
      projectId: row.projectId,
      environmentId: row.environmentId,
      workspaceKey: row.workspaceKey,
    },
    document: validation.workflow,
    documentSha256: row.documentSha256,
    version: row.version,
    testedVersion: row.testedVersion,
    lastTestSucceeded: row.lastTestSucceeded,
    createdByActorId: row.createdByActorId,
    updatedByActorId: row.updatedByActorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function selectWorkspace(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  scope: StudioV2WorkspaceScope,
  forUpdate = false
): Promise<StudioV2WorkspaceRecord | null> {
  const rows = await client.$queryRaw<StudioV2WorkspaceRow[]>(Prisma.sql`
    SELECT ${workspaceColumns()}
    FROM "flowcordia"."studio_v2_workspace"
    WHERE ${scopePredicate(scope)}
    LIMIT 1
    ${forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
  return rows[0] ? decodeWorkspace(rows[0]) : null;
}

async function appendWorkspaceEvent(
  tx: Prisma.TransactionClient,
  input: {
    workspace: StudioV2WorkspaceRecord;
    eventType:
      | "studio_v2_workspace.created"
      | "studio_v2_workspace.saved"
      | "studio_v2_workspace.tested";
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
      ${randomUUID()}, ${input.workspace.id}, ${input.workspace.scope.organizationId},
      ${input.workspace.scope.projectId}, ${input.workspace.scope.environmentId},
      ${input.eventType}, ${input.actorId},
      CAST(${JSON.stringify(input.payload)} AS JSONB), ${input.occurredAt}, ${input.occurredAt}
    )
  `);
}

export async function getStudioV2Workspace(
  scope: StudioV2WorkspaceScope
): Promise<StudioV2WorkspaceRecord | null> {
  return selectWorkspace(prisma, scope);
}

export async function listStudioV2Workspaces(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
}): Promise<StudioV2WorkspaceRecord[]> {
  const rows = await prisma.$queryRaw<StudioV2WorkspaceRow[]>(Prisma.sql`
    SELECT ${workspaceColumns()}
    FROM "flowcordia"."studio_v2_workspace"
    WHERE "organization_id" = ${input.organizationId}
      AND "project_id" = ${input.projectId}
      AND "environment_id" = ${input.environmentId}
    ORDER BY "updated_at" DESC
    LIMIT 200
  `);
  return rows.map(decodeWorkspace);
}

export async function saveStudioV2WorkspaceRecord(input: {
  scope: StudioV2WorkspaceScope;
  expectedVersion: bigint;
  document: WorkflowDefinition;
  actorId: string;
  now?: Date;
}): Promise<{ workspace: StudioV2WorkspaceRecord; created: boolean }> {
  const now = input.now ?? new Date();
  const documentSha256 = workflowSha256(input.document);

  return prisma.$transaction(async (tx) => {
    const existing = await selectWorkspace(tx, input.scope, true);
    if (!existing) {
      if (input.expectedVersion !== 0n) {
        throw new StudioV2WorkspaceError(
          "workspace_conflict",
          "The Studio V2 workspace no longer matches the expected version. Reload before saving."
        );
      }
      const id = randomUUID();
      const publicId = randomUUID();
      const rows = await tx.$queryRaw<StudioV2WorkspaceRow[]>(Prisma.sql`
        INSERT INTO "flowcordia"."studio_v2_workspace" (
          "id", "public_id", "organization_id", "project_id", "environment_id",
          "workspace_key", "document_json", "document_sha256", "version",
          "tested_version", "last_test_succeeded", "created_by_actor_id",
          "updated_by_actor_id", "created_at", "updated_at"
        ) VALUES (
          ${id}, ${publicId}, ${input.scope.organizationId}, ${input.scope.projectId},
          ${input.scope.environmentId}, ${input.scope.workspaceKey},
          CAST(${JSON.stringify(input.document)} AS JSONB), ${documentSha256}, 1,
          NULL, NULL, ${input.actorId}, ${input.actorId}, ${now}, ${now}
        )
        RETURNING ${workspaceColumns()}
      `);
      const workspace = decodeWorkspace(rows[0]!);
      await appendWorkspaceEvent(tx, {
        workspace,
        eventType: "studio_v2_workspace.created",
        actorId: input.actorId,
        payload: {
          publicId: workspace.publicId,
          workspaceKey: workspace.scope.workspaceKey,
          version: workspace.version.toString(),
          documentSha256: workspace.documentSha256,
        },
        occurredAt: now,
      });
      return { workspace, created: true };
    }

    if (existing.version !== input.expectedVersion) {
      throw new StudioV2WorkspaceError(
        "workspace_conflict",
        "The Studio V2 workspace changed in another session. Reload before saving."
      );
    }

    const rows = await tx.$queryRaw<StudioV2WorkspaceRow[]>(Prisma.sql`
      UPDATE "flowcordia"."studio_v2_workspace"
      SET "document_json" = CAST(${JSON.stringify(input.document)} AS JSONB),
          "document_sha256" = ${documentSha256},
          "version" = "version" + 1,
          "tested_version" = NULL,
          "last_test_succeeded" = NULL,
          "updated_by_actor_id" = ${input.actorId},
          "updated_at" = ${now}
      WHERE "id" = ${existing.id}
      RETURNING ${workspaceColumns()}
    `);
    const workspace = decodeWorkspace(rows[0]!);
    await appendWorkspaceEvent(tx, {
      workspace,
      eventType: "studio_v2_workspace.saved",
      actorId: input.actorId,
      payload: {
        publicId: workspace.publicId,
        workspaceKey: workspace.scope.workspaceKey,
        previousVersion: existing.version.toString(),
        version: workspace.version.toString(),
        documentSha256: workspace.documentSha256,
      },
      occurredAt: now,
    });
    return { workspace, created: false };
  });
}

export async function recordStudioV2WorkspaceTest(input: {
  scope: StudioV2WorkspaceScope;
  expectedVersion: bigint;
  actorId: string;
  success: boolean;
  issueCount: number;
  now?: Date;
}): Promise<StudioV2WorkspaceRecord> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const existing = await selectWorkspace(tx, input.scope, true);
    if (!existing) {
      throw new StudioV2WorkspaceError(
        "workspace_not_found",
        "The Studio V2 workspace was not found."
      );
    }
    if (existing.version !== input.expectedVersion) {
      throw new StudioV2WorkspaceError(
        "workspace_conflict",
        "The Studio V2 workspace changed before testing completed. Test the latest version again."
      );
    }

    const rows = await tx.$queryRaw<StudioV2WorkspaceRow[]>(Prisma.sql`
      UPDATE "flowcordia"."studio_v2_workspace"
      SET "tested_version" = "version",
          "last_test_succeeded" = ${input.success},
          "updated_by_actor_id" = ${input.actorId},
          "updated_at" = ${now}
      WHERE "id" = ${existing.id}
      RETURNING ${workspaceColumns()}
    `);
    const workspace = decodeWorkspace(rows[0]!);
    await appendWorkspaceEvent(tx, {
      workspace,
      eventType: "studio_v2_workspace.tested",
      actorId: input.actorId,
      payload: {
        publicId: workspace.publicId,
        workspaceKey: workspace.scope.workspaceKey,
        version: workspace.version.toString(),
        documentSha256: workspace.documentSha256,
        success: input.success,
        issueCount: input.issueCount,
      },
      occurredAt: now,
    });
    return workspace;
  });
}
