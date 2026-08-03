import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { InitializeDeploymentRequestBody } from "@trigger.dev/core/v3";
import type { WorkflowNode } from "@flowcordia/workflow";
import {
  deleteStudioV2ActivepiecesSimulationAppListeners,
  replaceStudioV2ActivepiecesSimulationAppListeners,
  type StudioV2ActivepiecesAppListener,
} from "./activepieces-app-event-listeners.server";
import { prisma } from "~/db.server";
import { authIncludeBase, toAuthenticated } from "~/models/runtimeEnvironment.server";
import { ArtifactsService } from "~/v3/services/artifacts.server";
import { InitializeDeploymentService } from "~/v3/services/initializeDeployment.server";
import { TriggerTaskService } from "~/v3/services/triggerTask.server";
import {
  createStudioV2ActivepiecesInteractionContext,
  STUDIO_V2_ACTIVEPIECES_INTERACTION_TASK_ID,
} from "./activepieces-interaction-context.server";

const RECOVERABLE_DEPLOYMENT_STATUSES = [
  "PENDING",
  "INSTALLING",
  "BUILDING",
  "DEPLOYING",
  "DEPLOYED",
] as const;
const RESULT_POLL_INTERVAL_MS = 250;
const RESULT_POLL_ATTEMPTS = 120;
const RECENT_SIMULATION_RUN_LIMIT = 100;

export type StudioV2ActivepiecesInteractionErrorCode =
  | "activepieces_interaction_invalid"
  | "activepieces_interaction_warming"
  | "activepieces_interaction_failed"
  | "activepieces_interaction_unavailable";

export class StudioV2ActivepiecesInteractionError extends Error {
  constructor(
    readonly code: StudioV2ActivepiecesInteractionErrorCode,
    readonly status: number,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "StudioV2ActivepiecesInteractionError";
  }
}

export type StudioV2ActivepiecesInteractionPayload =
  | {
      requestId?: string;
      kind: "property";
      interaction: {
        pieceName: string;
        actionOrTriggerName: string;
        propertyName: string;
        input: Record<string, unknown>;
        sampleData?: Record<string, unknown>;
        searchValue?: string;
      };
    }
  | {
      requestId?: string;
      kind: "trigger_test";
      interaction: {
        pieceName: string;
        triggerName: string;
        input: Record<string, unknown>;
        sampleData?: Record<string, unknown>;
        webhookUrl?: string;
        payload?: unknown;
      };
    }
  | {
      requestId?: string;
      kind: "trigger_webhook_inspect" | "trigger_handshake" | "trigger_renew";
      interaction: {
        pieceName: string;
        triggerName: string;
        input: Record<string, unknown>;
        sampleData?: Record<string, unknown>;
        webhookUrl?: string;
        payload?: unknown;
      };
    }
  | {
      requestId?: string;
      kind: "app_event_parse";
      payload: {
        body: unknown;
        rawBody?: unknown;
        method?: string;
        headers: Record<string, string>;
        queryParams: Record<string, string>;
      };
    }
  | {
      requestId?: string;
      kind: "trigger_simulation";
      environmentId: string;
      flowId: string;
      simulationId: string;
      interaction: {
        pieceName: string;
        triggerName: string;
        input: Record<string, unknown>;
        sampleData?: Record<string, unknown>;
      };
    }
  | {
      requestId?: string;
      kind: "action_test";
      node: WorkflowNode;
      workflowInput: unknown;
      outputs: Record<string, unknown>;
    };

export type StudioV2ActivepiecesInteractionExecution =
  | { runId: string; success: true; result: unknown }
  | { runId: string; success: false; message: string };

export type StudioV2ActivepiecesTriggerSimulation = {
  runId: string;
  requestId: string;
  simulationId: string;
  environmentId: string;
  flowId: string;
  pieceName: string;
  triggerName: string;
  triggerType?: string;
  testStrategy?: string;
  webhookUrl?: string;
  waitTokenUrl?: string;
  waitTokenId?: string;
  status: "STARTING" | "ARMING" | "ARMED" | "COMPLETED" | "CANCELED" | "FAILED";
  result?: unknown;
  message?: string;
  updatedAt?: string;
  appListeners?: StudioV2ActivepiecesAppListener[];
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactPieceVersion(pieceVersion: string): string {
  const exact =
    pieceVersion.startsWith("^") || pieceVersion.startsWith("~")
      ? pieceVersion.slice(1)
      : pieceVersion;
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(exact)) {
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_invalid",
      400,
      "Activepieces interaction piece version must be exact semantic versioning."
    );
  }
  return exact;
}

function validatePieceName(pieceName: string): string {
  if (!pieceName.startsWith("@activepieces/piece-") || pieceName.length > 256) {
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_invalid",
      400,
      "Activepieces interaction piece must be an official @activepieces/piece-* package."
    );
  }
  return pieceName;
}

function applicationRevision(): string {
  const revision = process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA?.trim();
  return revision && /^[0-9a-f]{40}$/i.test(revision) ? revision.toLowerCase() : "development";
}

function interactionIdentity(pieceName: string, pieceVersion: string): string {
  return createHash("sha256")
    .update(`${applicationRevision()}\0${pieceName}\0${pieceVersion}`)
    .digest("hex");
}

function deploymentCommitSha(identity: string): string {
  return `flowcordia_studio_v2_interaction_${identity}`;
}

function deploymentPayload(input: {
  identity: string;
  actorId: string;
  artifactKey: string;
}): InitializeDeploymentRequestBody {
  return {
    contentHash: input.identity,
    userId: input.actorId,
    selfHosted: false,
    gitMeta: {
      provider: "flowcordia",
      source: "local",
      commitSha: deploymentCommitSha(input.identity),
      commitMessage: "Prepare Flowcordia Studio Activepieces interaction runtime",
      dirty: false,
    },
    type: "MANAGED",
    initialStatus: "PENDING",
    isLocalBuild: false,
    triggeredVia: "dashboard",
    isNativeBuild: true,
    skipPromotion: false,
    artifactKey: input.artifactKey,
    configFilePath: "trigger.config.ts",
    skipEnqueue: false,
  };
}

async function uploadInteractionContext(input: {
  uploadUrl: string;
  uploadFields: Record<string, string>;
  archivePath: string;
}): Promise<void> {
  const archive = await readFile(input.archivePath);
  const form = new FormData();
  for (const [name, value] of Object.entries(input.uploadFields)) form.append(name, value);
  form.append(
    "file",
    new Blob([new Uint8Array(archive)], { type: "application/gzip" }),
    "flowcordia-studio-v2-activepieces-interaction.tar.gz"
  );
  const response = await fetch(input.uploadUrl, { method: "POST", body: form });
  if (!response.ok) {
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_unavailable",
      503,
      `Flowcordia could not upload the Activepieces interaction runtime (HTTP ${response.status}).`,
      true
    );
  }
}

async function createInteractionArtifact(input: {
  environment: Parameters<ArtifactsService["createArtifact"]>[1];
  contentLength: number;
}) {
  return new ArtifactsService()
    .createArtifact("deployment_context", input.environment, input.contentLength)
    .match(
      (artifact) => artifact,
      (): never => {
        throw new StudioV2ActivepiecesInteractionError(
          "activepieces_interaction_unavailable",
          503,
          "Flowcordia could not prepare the Activepieces interaction deployment artifact.",
          true
        );
      }
    );
}

async function environmentForInteraction(input: { projectId: string; environmentId: string }) {
  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      id: input.environmentId,
      projectId: input.projectId,
      archivedAt: null,
    },
    include: authIncludeBase,
  });
  if (!environment) {
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_unavailable",
      404,
      "The Studio runtime environment was not found."
    );
  }
  return environment;
}

async function ensureInteractionDeployment(input: {
  projectId: string;
  environmentId: string;
  actorId: string;
  pieceName: string;
  pieceVersion: string;
}) {
  const environment = await environmentForInteraction(input);
  const pieceName = validatePieceName(input.pieceName);
  const pieceVersion = exactPieceVersion(input.pieceVersion);
  const identity = interactionIdentity(pieceName, pieceVersion);
  const existing = await prisma.workerDeployment.findFirst({
    where: {
      projectId: input.projectId,
      environmentId: input.environmentId,
      commitSHA: deploymentCommitSha(identity),
      contentHash: identity,
      status: { in: [...RECOVERABLE_DEPLOYMENT_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, version: true, workerId: true },
  });
  if (existing) {
    if (existing.status === "DEPLOYED" && existing.workerId) {
      return { environment, deployment: existing };
    }
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_warming",
      503,
      "Trigger.dev is preparing the exact Activepieces piece runtime for Studio. The Builder will retry automatically.",
      true
    );
  }

  let context: Awaited<ReturnType<typeof createStudioV2ActivepiecesInteractionContext>> | undefined;
  try {
    context = await createStudioV2ActivepiecesInteractionContext({
      pieceName,
      pieceVersion,
      projectExternalRef: environment.project.externalRef,
    });
    const artifact = await createInteractionArtifact({
      environment,
      contentLength: context.contentLength,
    });
    await uploadInteractionContext({
      uploadUrl: artifact.uploadUrl,
      uploadFields: artifact.uploadFields,
      archivePath: context.archivePath,
    });
    await new InitializeDeploymentService().call(
      environment,
      deploymentPayload({ identity, actorId: input.actorId, artifactKey: artifact.artifactKey })
    );
  } catch (error) {
    if (error instanceof StudioV2ActivepiecesInteractionError) throw error;
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_unavailable",
      503,
      error instanceof Error
        ? `Flowcordia could not prepare the Activepieces interaction runtime: ${error.message}`
        : "Flowcordia could not prepare the Activepieces interaction runtime.",
      true
    );
  } finally {
    await context?.cleanup();
  }

  throw new StudioV2ActivepiecesInteractionError(
    "activepieces_interaction_warming",
    503,
    "Trigger.dev is preparing the exact Activepieces piece runtime for Studio. The Builder will retry automatically.",
    true
  );
}

async function ensureInteractionTask(input: {
  projectId: string;
  environmentId: string;
  actorId: string;
  pieceName: string;
  pieceVersion: string;
}) {
  const ready = await ensureInteractionDeployment(input);
  if (!ready.deployment.workerId) {
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_warming",
      503,
      "The Activepieces interaction worker is still being installed.",
      true
    );
  }
  const installed = await prisma.backgroundWorkerTask.findFirst({
    where: {
      projectId: input.projectId,
      runtimeEnvironmentId: input.environmentId,
      workerId: ready.deployment.workerId,
      slug: STUDIO_V2_ACTIVEPIECES_INTERACTION_TASK_ID,
    },
    select: { id: true },
  });
  if (!installed) {
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_warming",
      503,
      "The Activepieces interaction task is still being installed.",
      true
    );
  }
  return ready;
}

function parseInteractionMetadata(value: unknown, requestId: string) {
  if (!isRecord(value)) return null;
  const metadata = value.flowcordiaStudioInteraction;
  if (!isRecord(metadata) || metadata.requestId !== requestId) return null;
  if (metadata.status === "FAILED") {
    return {
      status: "FAILED" as const,
      message:
        typeof metadata.message === "string"
          ? metadata.message
          : "Activepieces interaction failed.",
    };
  }
  if (metadata.status !== "SUCCEEDED" || typeof metadata.result !== "string") return null;
  try {
    return { status: "SUCCEEDED" as const, result: JSON.parse(metadata.result) as unknown };
  } catch {
    return {
      status: "FAILED" as const,
      message: "Activepieces interaction returned invalid result metadata.",
    };
  }
}

function parseAppListeners(value: unknown): StudioV2ActivepiecesAppListener[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const listeners: StudioV2ActivepiecesAppListener[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !Array.isArray(candidate.events) || typeof candidate.identifierValue !== "string") {
      continue;
    }
    const events = candidate.events.filter((event): event is string => typeof event === "string");
    if (events.length === 0) continue;
    listeners.push({ events, identifierValue: candidate.identifierValue });
  }
  return listeners.length > 0 ? listeners : undefined;
}

function parseSimulationMetadata(
  value: unknown,
  runId: string
): StudioV2ActivepiecesTriggerSimulation | null {
  if (!isRecord(value)) return null;
  const metadata = value.flowcordiaActivepiecesTriggerSimulation;
  if (!isRecord(metadata)) return null;
  if (
    typeof metadata.requestId !== "string" ||
    typeof metadata.simulationId !== "string" ||
    typeof metadata.environmentId !== "string" ||
    typeof metadata.flowId !== "string" ||
    typeof metadata.pieceName !== "string" ||
    typeof metadata.triggerName !== "string" ||
    !["STARTING", "ARMING", "ARMED", "COMPLETED", "CANCELED", "FAILED"].includes(
      String(metadata.status)
    )
  ) {
    return null;
  }
  let result: unknown;
  if (typeof metadata.result === "string") {
    try {
      result = JSON.parse(metadata.result) as unknown;
    } catch {
      result = undefined;
    }
  }
  return {
    runId,
    requestId: metadata.requestId,
    simulationId: metadata.simulationId,
    environmentId: metadata.environmentId,
    flowId: metadata.flowId,
    pieceName: metadata.pieceName,
    triggerName: metadata.triggerName,
    triggerType: typeof metadata.triggerType === "string" ? metadata.triggerType : undefined,
    testStrategy: typeof metadata.testStrategy === "string" ? metadata.testStrategy : undefined,
    webhookUrl: typeof metadata.webhookUrl === "string" ? metadata.webhookUrl : undefined,
    waitTokenUrl: typeof metadata.waitTokenUrl === "string" ? metadata.waitTokenUrl : undefined,
    waitTokenId: typeof metadata.waitTokenId === "string" ? metadata.waitTokenId : undefined,
    status: metadata.status as StudioV2ActivepiecesTriggerSimulation["status"],
    result,
    message: typeof metadata.message === "string" ? metadata.message : undefined,
    updatedAt: typeof metadata.updatedAt === "string" ? metadata.updatedAt : undefined,
    appListeners: parseAppListeners(metadata.appListeners),
  };
}

async function recentTriggerSimulations(environmentId: string) {
  const runs = await prisma.taskRun.findMany({
    where: { runtimeEnvironmentId: environmentId },
    orderBy: { createdAt: "desc" },
    take: RECENT_SIMULATION_RUN_LIMIT,
    select: { id: true, metadata: true },
  });
  return runs
    .map((run) => parseSimulationMetadata(run.metadata, run.id))
    .filter(
      (simulation): simulation is StudioV2ActivepiecesTriggerSimulation => simulation !== null
    );
}

export async function findStudioV2ActivepiecesTriggerSimulation(input: {
  environmentId: string;
  simulationId: string;
}): Promise<StudioV2ActivepiecesTriggerSimulation | null> {
  const simulations = await recentTriggerSimulations(input.environmentId);
  return simulations.find((simulation) => simulation.simulationId === input.simulationId) ?? null;
}

export async function listStudioV2ActivepiecesTriggerSimulations(input: {
  environmentId: string;
  flowId: string;
}): Promise<StudioV2ActivepiecesTriggerSimulation[]> {
  const simulations = await recentTriggerSimulations(input.environmentId);
  return simulations.filter((simulation) => simulation.flowId === input.flowId);
}

export async function cancelStudioV2ActivepiecesTriggerSimulation(input: {
  environmentId: string;
  flowId: string;
}): Promise<boolean> {
  const simulations = await listStudioV2ActivepiecesTriggerSimulations(input);
  const active = simulations.find(
    (simulation) =>
      (simulation.status === "ARMING" || simulation.status === "ARMED") &&
      typeof simulation.waitTokenUrl === "string"
  );
  if (!active?.waitTokenUrl) return false;
  const response = await fetch(active.waitTokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "CANCEL" }),
    redirect: "error",
  });
  if (response.ok) {
    await deleteStudioV2ActivepiecesSimulationAppListeners({ simulationId: active.simulationId });
  }
  return response.ok;
}

export async function startStudioV2ActivepiecesTriggerSimulation(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
  flowId: string;
  pieceName: string;
  pieceVersion: string;
  interaction: {
    pieceName: string;
    triggerName: string;
    input: Record<string, unknown>;
    sampleData?: Record<string, unknown>;
  };
}): Promise<StudioV2ActivepiecesTriggerSimulation> {
  const { environment, deployment } = await ensureInteractionTask(input);
  const requestId = randomUUID();
  const simulationId = randomUUID();
  const payload: StudioV2ActivepiecesInteractionPayload = {
    requestId,
    kind: "trigger_simulation",
    environmentId: input.environmentId,
    flowId: input.flowId,
    simulationId,
    interaction: input.interaction,
  };
  const idempotencyKey = `flowcordia-studio-ap-simulation:${simulationId}`;
  const triggered = await new TriggerTaskService().call(
    STUDIO_V2_ACTIVEPIECES_INTERACTION_TASK_ID,
    toAuthenticated(environment),
    {
      payload: JSON.stringify(payload),
      options: {
        payloadType: "application/json",
        lockToVersion: deployment.version,
        idempotencyKey,
        idempotencyKeyTTL: "10m",
        metadata: {
          flowcordiaStudioInteraction: {
            schemaVersion: "0.1",
            requestId,
            status: "RUNNING",
            updatedAt: new Date().toISOString(),
          },
          flowcordiaActivepiecesTriggerSimulation: {
            schemaVersion: "0.1",
            requestId,
            simulationId,
            environmentId: input.environmentId,
            flowId: input.flowId,
            pieceName: input.pieceName,
            triggerName: input.interaction.triggerName,
            status: "STARTING",
            updatedAt: new Date().toISOString(),
          },
        },
      },
    },
    {
      idempotencyKey,
      idempotencyKeyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      triggerSource: "dashboard",
      triggerAction: "flowcordia_studio_activepieces_trigger_simulation",
    }
  );
  if (!triggered) {
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_warming",
      503,
      "The Activepieces trigger simulation task is not available on the exact worker version yet.",
      true
    );
  }

  for (let attempt = 0; attempt < RESULT_POLL_ATTEMPTS; attempt += 1) {
    const run = await prisma.taskRun.findUnique({
      where: { id: triggered.run.id },
      select: { metadata: true },
    });
    const simulation = parseSimulationMetadata(run?.metadata, triggered.run.id);
    if (simulation?.status === "ARMED") {
      if (simulation.triggerType === "APP_WEBHOOK" && simulation.appListeners?.length) {
        await replaceStudioV2ActivepiecesSimulationAppListeners({
          organizationId: input.organizationId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          actorId: input.actorId,
          workflowId: input.flowId,
          pieceName: input.pieceName,
          pieceVersion: exactPieceVersion(input.pieceVersion),
          triggerName: input.interaction.triggerName,
          simulationId,
          simulationRunId: triggered.run.id,
          appListeners: simulation.appListeners,
        });
      }
      return simulation;
    }
    if (simulation?.status === "COMPLETED") return simulation;
    if (simulation?.status === "FAILED") {
      throw new StudioV2ActivepiecesInteractionError(
        "activepieces_interaction_failed",
        400,
        simulation.message ?? "Activepieces trigger simulation failed."
      );
    }
    await sleep(RESULT_POLL_INTERVAL_MS);
  }

  throw new StudioV2ActivepiecesInteractionError(
    "activepieces_interaction_unavailable",
    503,
    "The Activepieces trigger simulation did not arm within the bounded Studio request window.",
    true
  );
}

export async function executeStudioV2ActivepiecesInteraction(input: {
  projectId: string;
  environmentId: string;
  actorId: string;
  pieceName: string;
  pieceVersion: string;
  payload: StudioV2ActivepiecesInteractionPayload;
  includeExecution?: boolean;
}): Promise<unknown> {
  const { environment, deployment } = await ensureInteractionTask(input);
  const requestId = input.payload.requestId ?? randomUUID();
  const payload = { ...input.payload, requestId };
  const idempotencyKey = `flowcordia-studio-ap:${requestId}`;
  const triggered = await new TriggerTaskService().call(
    STUDIO_V2_ACTIVEPIECES_INTERACTION_TASK_ID,
    toAuthenticated(environment),
    {
      payload: JSON.stringify(payload),
      options: {
        payloadType: "application/json",
        lockToVersion: deployment.version,
        idempotencyKey,
        idempotencyKeyTTL: "10m",
        metadata: {
          flowcordiaStudioInteraction: {
            schemaVersion: "0.1",
            requestId,
            status: "RUNNING",
            updatedAt: new Date().toISOString(),
          },
        },
      },
    },
    {
      idempotencyKey,
      idempotencyKeyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      triggerSource: "dashboard",
      triggerAction: "flowcordia_studio_activepieces_interaction",
    }
  );
  if (!triggered) {
    throw new StudioV2ActivepiecesInteractionError(
      "activepieces_interaction_warming",
      503,
      "The Activepieces interaction task is not available on the exact worker version yet.",
      true
    );
  }

  for (let attempt = 0; attempt < RESULT_POLL_ATTEMPTS; attempt += 1) {
    const run = await prisma.taskRun.findUnique({
      where: { id: triggered.run.id },
      select: { metadata: true },
    });
    const result = parseInteractionMetadata(run?.metadata, requestId);
    if (result?.status === "SUCCEEDED") {
      return input.includeExecution
        ? ({
            runId: triggered.run.id,
            success: true,
            result: result.result,
          } satisfies StudioV2ActivepiecesInteractionExecution)
        : result.result;
    }
    if (result?.status === "FAILED") {
      if (input.includeExecution) {
        return {
          runId: triggered.run.id,
          success: false,
          message: result.message,
        } satisfies StudioV2ActivepiecesInteractionExecution;
      }
      throw new StudioV2ActivepiecesInteractionError(
        "activepieces_interaction_failed",
        400,
        result.message
      );
    }
    await sleep(RESULT_POLL_INTERVAL_MS);
  }

  throw new StudioV2ActivepiecesInteractionError(
    "activepieces_interaction_unavailable",
    503,
    "The Activepieces interaction did not finish within the bounded Studio request window.",
    true
  );
}
