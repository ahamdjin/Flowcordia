import { randomUUID } from "node:crypto";
import type { JsonObject } from "@flowcordia/workflow";
import { Prisma } from "@trigger.dev/database";
import { prisma } from "~/db.server";
import { authIncludeBase, toAuthenticated } from "~/models/runtimeEnvironment.server";
import { DeleteTaskScheduleService } from "~/v3/services/deleteTaskSchedule.server";
import { TriggerTaskService } from "~/v3/services/triggerTask.server";
import { UpsertTaskScheduleService } from "~/v3/services/upsertTaskSchedule.server";
import {
  executeStudioV2ActivepiecesInteraction,
  StudioV2ActivepiecesInteractionError,
} from "./activepieces-interaction.server";
import type { StudioV2ReleaseRecord } from "./release-contract";

const APP_WEBHOOK_PATHS: Record<string, string> = {
  "@activepieces/piece-slack": "slack",
  "@activepieces/piece-square": "square",
  "@activepieces/piece-facebook-leads": "facebook-leads",
  "@activepieces/piece-intercom": "intercom",
};

type ProductionBindingStatus = "PREPARING" | "ENABLED" | "FAILED" | "REPLACED";
type ProductionScheduleKind = "POLLING" | "RENEW" | null;

export type StudioV2ActivepiecesProductionBinding = {
  id: string;
  releasePublicId: string;
  organizationId: string;
  projectId: string;
  runtimeEnvironmentId: string;
  workflowId: string;
  nodeId: string;
  taskId: string;
  scheduleTaskId: string;
  pieceName: string;
  pieceVersion: string;
  triggerName: string;
  input: JsonObject;
  propertySettings: JsonObject;
  triggerType: string | null;
  webhookUrl: string | null;
  appWebhookUrl: string | null;
  handshakeConfiguration: unknown;
  renewConfiguration: unknown;
  scheduleFriendlyId: string | null;
  scheduleKind: ProductionScheduleKind;
  status: ProductionBindingStatus;
  failureMessage: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

type ImmutableActivepiecesBinding = {
  kind: "activepieces";
  nodeId: string;
  taskId: string;
  scheduleTaskId: string;
  pieceName: string;
  pieceVersion: string;
  triggerName: string;
  input: JsonObject;
  propertySettings: JsonObject;
};

type TriggerDescriptor = { triggerType: string; testStrategy: string };
type TriggerEnableResult = TriggerDescriptor & {
  schedule: unknown;
  appListeners: Array<{ events: string[]; identifierValue: string }>;
};
type WebhookDescriptor = TriggerDescriptor & {
  handshakeConfiguration: unknown;
  renewConfiguration: unknown;
};

type BindingRow = StudioV2ActivepiecesProductionBinding;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value);
}

function immutableBinding(release: StudioV2ReleaseRecord): ImmutableActivepiecesBinding | null {
  const value = release.triggerBinding;
  if (!isRecord(value) || value.kind !== "activepieces") return null;
  if (
    typeof value.nodeId !== "string" ||
    typeof value.taskId !== "string" ||
    typeof value.scheduleTaskId !== "string" ||
    typeof value.pieceName !== "string" ||
    typeof value.pieceVersion !== "string" ||
    typeof value.triggerName !== "string" ||
    !isJsonObject(value.input) ||
    !isJsonObject(value.propertySettings)
  ) {
    throw new Error("The immutable Studio V2 Activepieces trigger binding is invalid.");
  }
  return {
    kind: "activepieces",
    nodeId: value.nodeId,
    taskId: value.taskId,
    scheduleTaskId: value.scheduleTaskId,
    pieceName: value.pieceName,
    pieceVersion: value.pieceVersion,
    triggerName: value.triggerName,
    input: value.input,
    propertySettings: value.propertySettings,
  };
}

function actorId(release: StudioV2ReleaseRecord): string {
  return release.deployedByActorId ?? release.stagedByActorId;
}

function publicOrigin(): string {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new Error("APP_ORIGIN is required to activate Activepieces production triggers.");
  return origin;
}

function productionWebhookUrl(release: StudioV2ReleaseRecord): string {
  return new URL(
    `/api/v1/flowcordia/activepieces/production-webhooks/${encodeURIComponent(release.publicId)}`,
    publicOrigin()
  ).toString();
}

function appWebhookUrl(pieceName: string): string | null {
  const path = APP_WEBHOOK_PATHS[pieceName];
  return path ? new URL(`/api/v1/app-events/${path}`, publicOrigin()).toString() : null;
}

function interaction(binding: ImmutableActivepiecesBinding, release: StudioV2ReleaseRecord, webhookUrl?: string | null) {
  return {
    pieceName: binding.pieceName,
    triggerName: binding.triggerName,
    flowId: release.document.id,
    input: binding.input,
    ...(webhookUrl ? { webhookUrl } : {}),
  };
}

function parseDescriptor(value: unknown): TriggerDescriptor {
  if (!isRecord(value) || typeof value.triggerType !== "string" || typeof value.testStrategy !== "string") {
    throw new Error("Activepieces returned an invalid trigger descriptor.");
  }
  return { triggerType: value.triggerType, testStrategy: value.testStrategy };
}

function parseEnableResult(value: unknown): TriggerEnableResult {
  const descriptor = parseDescriptor(value);
  if (!isRecord(value) || !Array.isArray(value.appListeners)) {
    throw new Error("Activepieces returned an invalid trigger activation result.");
  }
  const appListeners = value.appListeners.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !Array.isArray(candidate.events) ||
      candidate.events.some((event) => typeof event !== "string") ||
      typeof candidate.identifierValue !== "string"
    ) {
      throw new Error("Activepieces returned an invalid app-event listener declaration.");
    }
    return {
      events: candidate.events as string[],
      identifierValue: candidate.identifierValue,
    };
  });
  return { ...descriptor, schedule: value.schedule ?? null, appListeners };
}

function parseWebhookDescriptor(value: unknown): WebhookDescriptor {
  const descriptor = parseDescriptor(value);
  if (!isRecord(value)) throw new Error("Activepieces returned an invalid webhook descriptor.");
  return {
    ...descriptor,
    handshakeConfiguration: value.handshakeConfiguration ?? null,
    renewConfiguration: value.renewConfiguration ?? null,
  };
}

function exactPollingCron(schedule: unknown): { cron: string; timezone: string } {
  if (!isRecord(schedule)) throw new Error("Activepieces polling trigger did not provide a schedule.");
  if (typeof schedule.cronExpression === "string" && schedule.cronExpression.trim()) {
    return {
      cron: schedule.cronExpression.trim(),
      timezone: typeof schedule.timezone === "string" && schedule.timezone.trim() ? schedule.timezone.trim() : "UTC",
    };
  }
  if (typeof schedule.intervalMs !== "number" || !Number.isInteger(schedule.intervalMs) || schedule.intervalMs <= 0) {
    throw new Error("Activepieces polling schedule is not supported by the exact Trigger.dev schedule adapter.");
  }
  if (schedule.intervalMs % 60_000 !== 0) {
    throw new Error("Activepieces sub-minute polling cannot be represented exactly by Trigger.dev cron scheduling.");
  }
  const minutes = schedule.intervalMs / 60_000;
  if (minutes < 60 && 60 % minutes === 0) return { cron: `*/${minutes} * * * *`, timezone: "UTC" };
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours < 24 && 24 % hours === 0) return { cron: `0 */${hours} * * *`, timezone: "UTC" };
    if (hours === 24) return { cron: "0 0 * * *", timezone: "UTC" };
  }
  throw new Error("Activepieces interval polling cannot be represented exactly by Trigger.dev cron scheduling.");
}

function exactRenewCron(renewConfiguration: unknown): { cron: string; timezone: string } | null {
  if (renewConfiguration === null || renewConfiguration === undefined) return null;
  if (!isRecord(renewConfiguration) || typeof renewConfiguration.strategy !== "string") {
    throw new Error("Activepieces returned an invalid webhook renewal configuration.");
  }
  if (renewConfiguration.strategy === "NONE") return null;
  if (renewConfiguration.strategy !== "CRON" || typeof renewConfiguration.cronExpression !== "string") {
    throw new Error("Activepieces webhook renewal must use its exact CRON strategy on Trigger.dev.");
  }
  return { cron: renewConfiguration.cronExpression, timezone: "UTC" };
}

async function readBindingByRelease(releasePublicId: string): Promise<BindingRow | null> {
  const rows = await prisma.$queryRaw<BindingRow[]>(Prisma.sql`
    SELECT * FROM "FlowcordiaActivepiecesProductionBinding"
    WHERE "releasePublicId" = ${releasePublicId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getStudioV2ActivepiecesProductionBindingByRelease(
  releasePublicId: string
): Promise<StudioV2ActivepiecesProductionBinding | null> {
  return readBindingByRelease(releasePublicId);
}

export async function getStudioV2ActivepiecesProductionBindingByScheduleTask(
  environmentId: string,
  scheduleTaskId: string
): Promise<StudioV2ActivepiecesProductionBinding | null> {
  const rows = await prisma.$queryRaw<BindingRow[]>(Prisma.sql`
    SELECT * FROM "FlowcordiaActivepiecesProductionBinding"
    WHERE "runtimeEnvironmentId" = ${environmentId}
      AND "scheduleTaskId" = ${scheduleTaskId}
      AND "status" = 'ENABLED'
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function listStudioV2ActivepiecesProductionAppListeners(input: {
  pieceName: string;
  event: string;
  identifierValue: string;
}) {
  return prisma.$queryRaw<
    Array<{
      releasePublicId: string;
      organizationId: string;
      projectId: string;
      runtimeEnvironmentId: string;
      workflowId: string;
      nodeId: string;
      pieceName: string;
      pieceVersion: string;
      triggerName: string;
      createdByUserId: string;
    }>
  >(Prisma.sql`
    SELECT
      "releasePublicId", "organizationId", "projectId", "runtimeEnvironmentId",
      "workflowId", "nodeId", "pieceName", "pieceVersion", "triggerName", "createdByUserId"
    FROM "FlowcordiaActivepiecesProductionAppEventListener"
    WHERE "pieceName" = ${input.pieceName}
      AND "event" = ${input.event}
      AND "identifierValue" = ${input.identifierValue}
    ORDER BY "createdAt" ASC
  `);
}

export async function findStudioV2ActivepiecesProductionAppParserHost(pieceName: string) {
  const rows = await prisma.$queryRaw<
    Array<{
      releasePublicId: string;
      organizationId: string;
      projectId: string;
      runtimeEnvironmentId: string;
      workflowId: string;
      pieceName: string;
      pieceVersion: string;
      triggerName: string;
      createdByUserId: string;
    }>
  >(Prisma.sql`
    SELECT
      l."releasePublicId", l."organizationId", l."projectId", l."runtimeEnvironmentId",
      l."workflowId", l."pieceName", l."pieceVersion", l."triggerName", l."createdByUserId"
    FROM "FlowcordiaActivepiecesProductionAppEventListener" l
    JOIN "FlowcordiaActivepiecesProductionBinding" b
      ON b."releasePublicId" = l."releasePublicId"
    WHERE l."pieceName" = ${pieceName}
      AND b."status" = 'ENABLED'
    ORDER BY l."createdAt" ASC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function persistPreparingBinding(
  release: StudioV2ReleaseRecord,
  binding: ImmutableActivepiecesBinding,
  webhookUrl: string | null,
  appUrl: string | null
): Promise<void> {
  const now = new Date();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "FlowcordiaActivepiecesProductionBinding" (
      "id", "releasePublicId", "organizationId", "projectId", "runtimeEnvironmentId",
      "workflowId", "nodeId", "taskId", "scheduleTaskId", "pieceName", "pieceVersion",
      "triggerName", "input", "propertySettings", "webhookUrl", "appWebhookUrl", "status",
      "createdByUserId", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${release.publicId}, ${release.scope.organizationId}, ${release.scope.projectId},
      ${release.scope.environmentId}, ${release.document.id}, ${binding.nodeId}, ${binding.taskId},
      ${binding.scheduleTaskId}, ${binding.pieceName}, ${binding.pieceVersion}, ${binding.triggerName},
      CAST(${JSON.stringify(binding.input)} AS JSONB), CAST(${JSON.stringify(binding.propertySettings)} AS JSONB),
      ${webhookUrl}, ${appUrl}, 'PREPARING', ${actorId(release)}, ${now}, ${now}
    )
    ON CONFLICT ("releasePublicId") DO UPDATE SET
      "updatedAt" = EXCLUDED."updatedAt",
      "failureMessage" = NULL
  `);
}

async function markBindingFailure(releasePublicId: string, message: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "FlowcordiaActivepiecesProductionBinding"
    SET "status" = 'FAILED', "failureMessage" = ${message}, "updatedAt" = ${new Date()}
    WHERE "releasePublicId" = ${releasePublicId}
  `);
}

async function replaceAppListeners(input: {
  release: StudioV2ReleaseRecord;
  binding: ImmutableActivepiecesBinding;
  listeners: TriggerEnableResult["appListeners"];
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "FlowcordiaActivepiecesProductionAppEventListener"
      WHERE "releasePublicId" = ${input.release.publicId}
    `);
    for (const listener of input.listeners) {
      for (const event of listener.events) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "FlowcordiaActivepiecesProductionAppEventListener" (
            "id", "releasePublicId", "organizationId", "projectId", "runtimeEnvironmentId",
            "workflowId", "nodeId", "pieceName", "pieceVersion", "triggerName", "event",
            "identifierValue", "createdByUserId", "createdAt"
          ) VALUES (
            ${randomUUID()}, ${input.release.publicId}, ${input.release.scope.organizationId},
            ${input.release.scope.projectId}, ${input.release.scope.environmentId}, ${input.release.document.id},
            ${input.binding.nodeId}, ${input.binding.pieceName}, ${input.binding.pieceVersion},
            ${input.binding.triggerName}, ${event}, ${listener.identifierValue}, ${actorId(input.release)}, ${new Date()}
          ) ON CONFLICT DO NOTHING
        `);
      }
    }
  });
}

async function upsertProductionSchedule(input: {
  release: StudioV2ReleaseRecord;
  binding: ImmutableActivepiecesBinding;
  cron: string;
  timezone: string;
  kind: Exclude<ProductionScheduleKind, null>;
}) {
  const result = await new UpsertTaskScheduleService().call(input.release.scope.projectId, {
    taskIdentifier: input.binding.scheduleTaskId,
    cron: input.cron,
    timezone: input.timezone,
    environments: [input.release.scope.environmentId],
    deduplicationKey: `flowcordia-ap-production:${input.release.scope.environmentId}:${input.release.document.id}`,
    externalId: input.release.publicId,
  });
  return { friendlyId: result.id, kind: input.kind };
}

async function previousEnabledBinding(release: StudioV2ReleaseRecord): Promise<BindingRow | null> {
  const rows = await prisma.$queryRaw<BindingRow[]>(Prisma.sql`
    SELECT * FROM "FlowcordiaActivepiecesProductionBinding"
    WHERE "runtimeEnvironmentId" = ${release.scope.environmentId}
      AND "workflowId" = ${release.document.id}
      AND "releasePublicId" <> ${release.publicId}
      AND "status" = 'ENABLED'
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function disablePreviousBinding(previous: BindingRow): Promise<void> {
  try {
    await executeStudioV2ActivepiecesInteraction({
      projectId: previous.projectId,
      environmentId: previous.runtimeEnvironmentId,
      actorId: previous.createdByUserId,
      pieceName: previous.pieceName,
      pieceVersion: previous.pieceVersion,
      payload: {
        kind: "trigger_disable",
        interaction: {
          pieceName: previous.pieceName,
          triggerName: previous.triggerName,
          flowId: previous.workflowId,
          input: previous.input,
          ...(previous.webhookUrl ? { webhookUrl: previous.webhookUrl } : {}),
        },
      },
    });
  } finally {
    if (previous.scheduleFriendlyId) {
      await new DeleteTaskScheduleService()
        .call({
          projectId: previous.projectId,
          userId: previous.createdByUserId,
          friendlyId: previous.scheduleFriendlyId,
        })
        .catch(() => undefined);
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "FlowcordiaActivepiecesProductionAppEventListener"
        WHERE "releasePublicId" = ${previous.releasePublicId}
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "FlowcordiaActivepiecesProductionBinding"
        SET "status" = 'REPLACED', "updatedAt" = ${new Date()}
        WHERE "releasePublicId" = ${previous.releasePublicId}
      `);
    });
  }
}

export async function ensureStudioV2ActivepiecesProductionBinding(
  release: StudioV2ReleaseRecord
): Promise<StudioV2ActivepiecesProductionBinding | null> {
  const binding = immutableBinding(release);
  if (!binding) return null;
  if (release.status !== "DEPLOYED" || !release.deploymentId) return readBindingByRelease(release.publicId);

  const existing = await readBindingByRelease(release.publicId);
  if (existing?.status === "ENABLED") return existing;
  if (existing?.status === "FAILED") {
    throw new Error(existing.failureMessage ?? "Activepieces production trigger activation previously failed.");
  }

  const webhookUrl = productionWebhookUrl(release);
  const appUrl = appWebhookUrl(binding.pieceName);
  await persistPreparingBinding(release, binding, webhookUrl, appUrl);

  try {
    const descriptor = parseDescriptor(
      await executeStudioV2ActivepiecesInteraction({
        projectId: release.scope.projectId,
        environmentId: release.scope.environmentId,
        actorId: actorId(release),
        pieceName: binding.pieceName,
        pieceVersion: binding.pieceVersion,
        payload: {
          kind: "trigger_inspect",
          interaction: interaction(binding, release, webhookUrl),
        },
      })
    );

    let enableResult: TriggerEnableResult = { ...descriptor, schedule: null, appListeners: [] };
    let webhookDescriptor: WebhookDescriptor | null = null;
    if (descriptor.triggerType !== "MANUAL") {
      if (descriptor.triggerType === "WEBHOOK") {
        webhookDescriptor = parseWebhookDescriptor(
          await executeStudioV2ActivepiecesInteraction({
            projectId: release.scope.projectId,
            environmentId: release.scope.environmentId,
            actorId: actorId(release),
            pieceName: binding.pieceName,
            pieceVersion: binding.pieceVersion,
            payload: {
              kind: "trigger_webhook_inspect",
              interaction: interaction(binding, release, webhookUrl),
            },
          })
        );
      }
      enableResult = parseEnableResult(
        await executeStudioV2ActivepiecesInteraction({
          projectId: release.scope.projectId,
          environmentId: release.scope.environmentId,
          actorId: actorId(release),
          pieceName: binding.pieceName,
          pieceVersion: binding.pieceVersion,
          payload: {
            kind: "trigger_enable",
            interaction: interaction(binding, release, descriptor.triggerType === "APP_WEBHOOK" ? appUrl : webhookUrl),
          },
        })
      );
    }

    let schedule: { friendlyId: string; kind: Exclude<ProductionScheduleKind, null> } | null = null;
    if (descriptor.triggerType === "POLLING") {
      const exact = exactPollingCron(enableResult.schedule);
      schedule = await upsertProductionSchedule({ release, binding, ...exact, kind: "POLLING" });
    } else if (descriptor.triggerType === "WEBHOOK") {
      const exact = exactRenewCron(webhookDescriptor?.renewConfiguration);
      if (exact) schedule = await upsertProductionSchedule({ release, binding, ...exact, kind: "RENEW" });
    } else if (descriptor.triggerType === "APP_WEBHOOK") {
      if (!appUrl) throw new Error(`Activepieces APP_WEBHOOK piece ${binding.pieceName} has no exact upstream route mapping.`);
      await replaceAppListeners({ release, binding, listeners: enableResult.appListeners });
    }

    const previous = await previousEnabledBinding(release);
    if (previous) await disablePreviousBinding(previous);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "FlowcordiaActivepiecesProductionBinding"
      SET
        "triggerType" = ${descriptor.triggerType},
        "handshakeConfiguration" = CAST(${JSON.stringify(webhookDescriptor?.handshakeConfiguration ?? null)} AS JSONB),
        "renewConfiguration" = CAST(${JSON.stringify(webhookDescriptor?.renewConfiguration ?? null)} AS JSONB),
        "scheduleFriendlyId" = ${schedule?.friendlyId ?? null},
        "scheduleKind" = ${schedule?.kind ?? null},
        "status" = 'ENABLED',
        "failureMessage" = NULL,
        "updatedAt" = ${new Date()}
      WHERE "releasePublicId" = ${release.publicId}
    `);
    return readBindingByRelease(release.publicId);
  } catch (error) {
    if (error instanceof StudioV2ActivepiecesInteractionError && error.retryable) throw error;
    const message = error instanceof Error ? error.message : "Activepieces production trigger activation failed.";
    await markBindingFailure(release.publicId, message);
    throw error;
  }
}

async function releaseRuntime(release: StudioV2ReleaseRecord) {
  if (!release.deploymentId) throw new Error("The Studio V2 release has no deployed Trigger.dev worker version.");
  const [environment, deployment] = await Promise.all([
    prisma.runtimeEnvironment.findFirst({
      where: { id: release.scope.environmentId, projectId: release.scope.projectId },
      include: authIncludeBase,
    }),
    prisma.workerDeployment.findFirst({
      where: {
        id: release.deploymentId,
        projectId: release.scope.projectId,
        environmentId: release.scope.environmentId,
        status: "DEPLOYED",
      },
      select: { version: true, workerId: true },
    }),
  ]);
  if (!environment || !deployment?.workerId) throw new Error("The deployed Studio V2 Trigger.dev runtime is unavailable.");
  const installed = await prisma.backgroundWorkerTask.findFirst({
    where: {
      projectId: release.scope.projectId,
      runtimeEnvironmentId: release.scope.environmentId,
      workerId: deployment.workerId,
      slug: release.taskId,
    },
    select: { id: true },
  });
  if (!installed) throw new Error("The immutable Studio V2 workflow task is not installed on its deployed worker version.");
  return { environment, deployment };
}

export async function triggerStudioV2ActivepiecesProductionItems(input: {
  release: StudioV2ReleaseRecord;
  items: unknown[];
  idempotencyBase?: string;
  triggerAction: string;
}): Promise<string[]> {
  const { environment, deployment } = await releaseRuntime(input.release);
  const runIds: string[] = [];
  for (const [index, item] of input.items.entries()) {
    const idempotencyKey = input.idempotencyBase ? `${input.idempotencyBase}:${index}` : undefined;
    const triggered = await new TriggerTaskService().call(
      input.release.taskId,
      toAuthenticated(environment),
      {
        payload: JSON.stringify(item ?? null),
        options: {
          payloadType: "application/json",
          lockToVersion: deployment.version,
          ...(idempotencyKey
            ? { idempotencyKey, idempotencyKeyTTL: "24h" }
            : {}),
        },
      },
      {
        ...(idempotencyKey
          ? {
              idempotencyKey,
              idempotencyKeyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            }
          : {}),
        triggerSource: "api",
        triggerAction: input.triggerAction,
      }
    );
    if (!triggered) throw new Error("The immutable Studio V2 Trigger.dev task could not be triggered.");
    runIds.push(triggered.run.id);
  }
  return runIds;
}

export async function runStudioV2ActivepiecesProductionTrigger(input: {
  release: StudioV2ReleaseRecord;
  binding: StudioV2ActivepiecesProductionBinding;
  payload?: unknown;
  idempotencyBase?: string;
  triggerAction: string;
}): Promise<string[]> {
  const result = await executeStudioV2ActivepiecesInteraction({
    projectId: input.binding.projectId,
    environmentId: input.binding.runtimeEnvironmentId,
    actorId: input.binding.createdByUserId,
    pieceName: input.binding.pieceName,
    pieceVersion: input.binding.pieceVersion,
    payload: {
      kind: "trigger_run",
      interaction: {
        pieceName: input.binding.pieceName,
        triggerName: input.binding.triggerName,
        flowId: input.binding.workflowId,
        input: input.binding.input,
        ...(input.binding.webhookUrl ? { webhookUrl: input.binding.webhookUrl } : {}),
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
      },
    },
  });
  if (!Array.isArray(result)) throw new Error("Activepieces trigger run() did not return an item array.");
  return triggerStudioV2ActivepiecesProductionItems({
    release: input.release,
    items: result,
    idempotencyBase: input.idempotencyBase,
    triggerAction: input.triggerAction,
  });
}

export async function runStudioV2ActivepiecesProductionSchedule(input: {
  release: StudioV2ReleaseRecord;
  binding: StudioV2ActivepiecesProductionBinding;
  runId: string;
}): Promise<string[]> {
  if (input.binding.scheduleKind === "RENEW") {
    await executeStudioV2ActivepiecesInteraction({
      projectId: input.binding.projectId,
      environmentId: input.binding.runtimeEnvironmentId,
      actorId: input.binding.createdByUserId,
      pieceName: input.binding.pieceName,
      pieceVersion: input.binding.pieceVersion,
      payload: {
        kind: "trigger_renew",
        interaction: {
          pieceName: input.binding.pieceName,
          triggerName: input.binding.triggerName,
          flowId: input.binding.workflowId,
          input: input.binding.input,
          ...(input.binding.webhookUrl ? { webhookUrl: input.binding.webhookUrl } : {}),
        },
      },
    });
    return [];
  }
  if (input.binding.scheduleKind !== "POLLING") {
    throw new Error("The Activepieces production schedule is not bound to polling or renewal.");
  }
  return runStudioV2ActivepiecesProductionTrigger({
    release: input.release,
    binding: input.binding,
    idempotencyBase: `flowcordia-ap-schedule:${input.runId}`,
    triggerAction: "flowcordia_activepieces_polling",
  });
}
