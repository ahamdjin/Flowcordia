import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { InitializeDeploymentRequestBody } from "@trigger.dev/core/v3";
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
      kind: "action_test";
      node: Record<string, unknown>;
      workflowInput: unknown;
      outputs: Record<string, unknown>;
    };

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactPieceVersion(pieceVersion: string): string {
  const exact = pieceVersion.startsWith("^") || pieceVersion.startsWith("~")
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

function parseInteractionMetadata(value: unknown, requestId: string) {
  if (!isRecord(value)) return null;
  const metadata = value.flowcordiaStudioInteraction;
  if (!isRecord(metadata) || metadata.requestId !== requestId) return null;
  if (metadata.status === "FAILED") {
    return {
      status: "FAILED" as const,
      message:
        typeof metadata.message === "string" ? metadata.message : "Activepieces interaction failed.",
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

export async function executeStudioV2ActivepiecesInteraction(input: {
  projectId: string;
  environmentId: string;
  actorId: string;
  pieceName: string;
  pieceVersion: string;
  payload: StudioV2ActivepiecesInteractionPayload;
}): Promise<unknown> {
  const { environment, deployment } = await ensureInteractionDeployment(input);
  if (!deployment.workerId) {
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
      workerId: deployment.workerId,
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
    if (result?.status === "SUCCEEDED") return result.result;
    if (result?.status === "FAILED") {
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
