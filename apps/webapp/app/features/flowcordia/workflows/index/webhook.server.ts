import { Prisma } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import { BranchTrackingConfigSchema } from "~/v3/github";
import { resolveWorkflowIndexScope } from "./scope.server";
import {
  completeWorkflowIndexWebhookDelivery,
  insertWorkflowIndexWebhookDelivery,
  requestWorkflowIndexSync,
} from "./repository.server";

type UnknownRecord = Record<string, unknown>;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ZERO_OBJECT_ID_PATTERN = /^0{40}$|^0{64}$/;

export class WorkflowIndexWebhookReplayMismatchError extends Error {
  constructor() {
    super("GitHub workflow-index delivery ID was replayed with different bytes.");
    this.name = "WorkflowIndexWebhookReplayMismatchError";
  }
}

export interface NormalizedWorkflowIndexPush {
  installationId: number;
  repositoryGithubId: string;
  ref: string;
  branch: string;
  afterSha: string;
  deleted: boolean;
}

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function decimalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9][0-9]{0,39}$/.test(value)) return value;
  return undefined;
}

export function normalizeWorkflowIndexPush(payload: unknown): NormalizedWorkflowIndexPush | null {
  const root = record(payload);
  const installation = record(root?.installation);
  const repository = record(root?.repository);
  const installationId = installation?.id;
  const repositoryGithubId = decimalId(repository?.id);
  const ref = root?.ref;
  const afterSha = root?.after;
  const deleted = root?.deleted;
  if (
    !root ||
    typeof installationId !== "number" ||
    !Number.isSafeInteger(installationId) ||
    installationId <= 0 ||
    !repositoryGithubId ||
    typeof ref !== "string" ||
    ref.length < 12 ||
    ref.length > 1024 ||
    !ref.startsWith("refs/heads/") ||
    typeof afterSha !== "string" ||
    !OBJECT_ID_PATTERN.test(afterSha) ||
    typeof deleted !== "boolean"
  ) {
    return null;
  }
  const branch = ref.slice("refs/heads/".length);
  if (!branch || branch.length > 255 || branch.includes("\0")) return null;
  return {
    installationId,
    repositoryGithubId,
    ref,
    branch,
    afterSha,
    deleted: deleted || ZERO_OBJECT_ID_PATTERN.test(afterSha),
  };
}

async function existingDeliveryStatus(
  deliveryId: string
): Promise<{ payloadHash: string; status: string } | null> {
  const rows = await prisma.$queryRaw<Array<{ payloadHash: string; status: string }>>(Prisma.sql`
    SELECT "payload_hash" AS "payloadHash", "status"
    FROM "flowcordia"."workflow_index_webhook_delivery"
    WHERE "delivery_id" = ${deliveryId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function ingestWorkflowIndexPush(input: {
  deliveryId: string;
  payloadHash: string;
  receivedAt: Date;
  push: NormalizedWorkflowIndexPush;
}): Promise<{ status: "scheduled" | "ignored" | "duplicate"; projects: number }> {
  const inserted = await insertWorkflowIndexWebhookDelivery({
    deliveryId: input.deliveryId,
    payloadHash: input.payloadHash,
    appInstallationId: input.push.installationId,
    repositoryGithubId: input.push.repositoryGithubId,
    ref: input.push.ref,
    afterSha: input.push.afterSha,
    receivedAt: input.receivedAt,
  });
  if (inserted.status === "mismatch") throw new WorkflowIndexWebhookReplayMismatchError();
  if (inserted.status === "duplicate") {
    const existing = await existingDeliveryStatus(input.deliveryId);
    if (!existing || existing.payloadHash !== input.payloadHash) {
      throw new WorkflowIndexWebhookReplayMismatchError();
    }
    if (existing.status === "SCHEDULED" || existing.status === "IGNORED") {
      return { status: "duplicate", projects: 0 };
    }
  }

  if (input.push.deleted) {
    await completeWorkflowIndexWebhookDelivery({
      deliveryId: input.deliveryId,
      status: "IGNORED",
      failureCode: "branch_deleted",
    });
    return { status: "ignored", projects: 0 };
  }

  const connections = await prisma.connectedGithubRepository.findMany({
    where: {
      repository: {
        githubId: BigInt(input.push.repositoryGithubId),
        installation: {
          appInstallationId: BigInt(input.push.installationId),
          deletedAt: null,
          suspendedAt: null,
        },
      },
      project: { deletedAt: null },
    },
    select: {
      branchTracking: true,
      project: { select: { id: true, organizationId: true } },
      repository: { select: { defaultBranch: true } },
    },
  });

  let projects = 0;
  for (const connection of connections) {
    const tracking = BranchTrackingConfigSchema.safeParse(connection.branchTracking);
    if (!tracking.success) continue;
    const productionBranch = tracking.data.prod.branch ?? connection.repository.defaultBranch;
    if (productionBranch !== input.push.branch) continue;
    const scope = await resolveWorkflowIndexScope({
      organizationId: connection.project.organizationId,
      projectId: connection.project.id,
    });
    await requestWorkflowIndexSync({
      scope,
      reason: "push",
      requestedCommitSha: input.push.afterSha,
      actorId: "github:webhook",
      correlationId: input.deliveryId,
      now: input.receivedAt,
    });
    projects += 1;
  }

  await completeWorkflowIndexWebhookDelivery({
    deliveryId: input.deliveryId,
    status: projects > 0 ? "SCHEDULED" : "IGNORED",
    failureCode: projects > 0 ? null : "no_tracked_project_branch",
  });
  return { status: projects > 0 ? "scheduled" : "ignored", projects };
}
