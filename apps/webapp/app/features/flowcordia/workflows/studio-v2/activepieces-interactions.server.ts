import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { prettyPrintPacket, type InitializeDeploymentRequestBody } from "@trigger.dev/core/v3";
import type { JsonValue, WorkflowNode } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { findEnvironmentById } from "~/models/runtimeEnvironment.server";
import { ArtifactsService } from "~/v3/services/artifacts.server";
import { InitializeDeploymentService } from "~/v3/services/initializeDeployment.server";
import { TriggerTaskService } from "~/v3/services/triggerTask.server";
import { runStore } from "~/v3/runStore.server";
import { FINAL_ATTEMPT_STATUSES, isFinalRunStatus } from "~/v3/taskStatus";
import { createStudioV2DeploymentContext } from "./deployment-context.server";
import {
  createStudioV2ActivepiecesInteractionArtifact,
  type StudioV2ActivepiecesInteractionArtifact,
  type StudioV2ActivepiecesInteractionCoordinates,
} from "./activepieces-interaction-source";

const DEPLOYMENT_WAIT_MS = 120_000;
const RUN_WAIT_MS = 75_000;
const POLL_MS = 350;
const RECOVERABLE_DEPLOYMENT_STATUSES = [
  "PENDING",
  "INSTALLING",
  "BUILDING",
  "DEPLOYING",
  "DEPLOYED",
] as const;
const FAILED_DEPLOYMENT_STATUSES = new Set(["FAILED", "CANCELED", "TIMED_OUT"]);

export type StudioV2ActivepiecesInteractionPayload =
  | {
      operation: "options";
      projectId: string;
      projectExternalId: string;
      request: {
        pieceName: string;
        pieceVersion: string;
        actionOrTriggerName: string;
        propertyName: string;
        input: Record<string, JsonValue>;
        searchValue?: string;
        sampleData?: Record<string, JsonValue>;
      };
    }
  | {
      operation: "revalidate";
      projectId: string;
      projectExternalId: string;
      request: {
        pieceName: string;
        pieceVersion: string;
        connectionExternalId: string;
      };
    }
  | {
      operation: "test_action";
      projectId: string;
      projectExternalId: string;
      node: WorkflowNode;
      workflowInput: JsonValue;
      outputs: Record<string, JsonValue>;
    };

export class StudioV2ActivepiecesInteractionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "StudioV2ActivepiecesInteractionError";
  }
}

function buildRevision(): string {
  return process.env.BUILD_GIT_SHA?.trim() || "development";
}

function deploymentContentHash(artifact: StudioV2ActivepiecesInteractionArtifact): string {
  return createHash("sha256")
    .update(`${artifact.sourceSha256}:${buildRevision()}`)
    .digest("hex");
}

function deploymentCommitSha(artifact: StudioV2ActivepiecesInteractionArtifact): string {
  return `${artifact.deploymentIdentity}_${createHash("sha256")
    .update(buildRevision())
    .digest("hex")
    .slice(0, 12)}`;
}

function deploymentPayload(input: {
  artifact: StudioV2ActivepiecesInteractionArtifact;
  actorId: string;
  artifactKey: string;
  contentHash: string;
}): InitializeDeploymentRequestBody {
  return {
    contentHash: input.contentHash,
    userId: input.actorId,
    selfHosted: false,
    gitMeta: {
      provider: "flowcordia",
      source: "local",
      commitSha: deploymentCommitSha(input.artifact),
      commitMessage: `Prepare Activepieces Studio interaction ${input.artifact.taskId}`,
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

async function createDeploymentArtifact(input: {
  environment: NonNullable<Awaited<ReturnType<typeof findEnvironmentById>>>;
  contentLength: number;
}) {
  return new ArtifactsService()
    .createArtifact("deployment_context", input.environment, input.contentLength)
    .match(
      (artifact) => artifact,
      (error): never => {
        throw new StudioV2ActivepiecesInteractionError(
          "interaction_artifact_failed",
          503,
          `Flowcordia could not prepare the Activepieces interaction deployment (${error.type}).`,
          true
        );
      }
    );
}

async function uploadDeploymentContext(input: {
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
    "flowcordia-activepieces-interaction.tar.gz"
  );
  const response = await fetch(input.uploadUrl, { method: "POST", body: form });
  if (!response.ok) {
    throw new StudioV2ActivepiecesInteractionError(
      "interaction_artifact_upload_failed",
      503,
      `The Activepieces interaction deployment upload failed with HTTP ${response.status}.`,
      true
    );
  }
}

async function waitForDeployment(deploymentId: string): Promise<void> {
  const deadline = Date.now() + DEPLOYMENT_WAIT_MS;
  while (Date.now() < deadline) {
    const deployment = await prisma.workerDeployment.findUnique({
      where: { id: deploymentId },
      select: { status: true },
    });
    if (!deployment) {
      throw new StudioV2ActivepiecesInteractionError(
        "interaction_deployment_missing",
        503,
        "The Trigger.dev interaction deployment disappeared before it became available.",
        true
      );
    }
    if (deployment.status === "DEPLOYED") return;
    if (FAILED_DEPLOYMENT_STATUSES.has(deployment.status)) {
      throw new StudioV2ActivepiecesInteractionError(
        "interaction_deployment_failed",
        503,
        `The Trigger.dev interaction deployment ended with status ${deployment.status}.`,
        true
      );
    }
    await sleep(POLL_MS);
  }
  throw new StudioV2ActivepiecesInteractionError(
    "interaction_deployment_timeout",
    504,
    "The Trigger.dev interaction deployment did not become ready in time.",
    true
  );
}

async function ensureInteractionDeployment(input: {
  environment: NonNullable<Awaited<ReturnType<typeof findEnvironmentById>>>;
  actorId: string;
  artifact: StudioV2ActivepiecesInteractionArtifact;
}): Promise<void> {
  const contentHash = deploymentContentHash(input.artifact);
  const commitSHA = deploymentCommitSha(input.artifact);
  const existing = await prisma.workerDeployment.findFirst({
    where: {
      environmentId: input.environment.id,
      commitSHA,
      contentHash,
      status: { in: [...RECOVERABLE_DEPLOYMENT_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status !== "DEPLOYED") await waitForDeployment(existing.id);
    return;
  }

  const context = await createStudioV2DeploymentContext({
    release: input.artifact,
    projectExternalRef: input.environment.project.externalRef,
  });
  try {
    const storedArtifact = await createDeploymentArtifact({
      environment: input.environment,
      contentLength: context.contentLength,
    });
    await uploadDeploymentContext({
      uploadUrl: storedArtifact.uploadUrl,
      uploadFields: storedArtifact.uploadFields,
      archivePath: context.archivePath,
    });
    const initialized = await new InitializeDeploymentService().call(
      input.environment,
      deploymentPayload({
        artifact: input.artifact,
        actorId: input.actorId,
        artifactKey: storedArtifact.artifactKey,
        contentHash,
      })
    );
    await waitForDeployment(initialized.deployment.id);
  } finally {
    await context.cleanup();
  }
}

async function decodeRunOutput(runId: string): Promise<unknown> {
  const deadline = Date.now() + RUN_WAIT_MS;
  while (Date.now() < deadline) {
    const run = await runStore.findRun(
      { id: runId },
      { select: { id: true, status: true } }
    );
    if (!run) {
      await sleep(POLL_MS);
      continue;
    }
    if (!isFinalRunStatus(run.status)) {
      await sleep(POLL_MS);
      continue;
    }

    const attempt = await runStore.findTaskRunAttempt({
      select: { output: true, outputType: true, error: true },
      where: { taskRunId: run.id, status: { in: FINAL_ATTEMPT_STATUSES } },
      orderBy: { createdAt: "desc" },
    });
    if (!attempt) {
      throw new StudioV2ActivepiecesInteractionError(
        "interaction_run_missing_attempt",
        502,
        "The Trigger.dev interaction run ended without a final attempt."
      );
    }
    if (attempt.error) {
      throw new StudioV2ActivepiecesInteractionError(
        "interaction_run_failed",
        422,
        "The Activepieces interaction failed inside Trigger.dev."
      );
    }
    if (attempt.outputType === "application/store") {
      throw new StudioV2ActivepiecesInteractionError(
        "interaction_output_too_large",
        413,
        "The Activepieces interaction returned too much data for the Studio UI. Narrow the search or reduce the test output."
      );
    }
    if (attempt.output === null || attempt.output === undefined) return null;
    const printed = await prettyPrintPacket(attempt.output, attempt.outputType ?? undefined);
    if (
      attempt.outputType === "application/json" ||
      attempt.outputType === "application/super+json"
    ) {
      return JSON.parse(printed) as unknown;
    }
    return printed;
  }
  throw new StudioV2ActivepiecesInteractionError(
    "interaction_run_timeout",
    504,
    "The Activepieces interaction did not finish in time.",
    true
  );
}

export async function runStudioV2ActivepiecesInteraction(input: {
  projectId: string;
  environmentId: string;
  actorId: string;
  coordinates: StudioV2ActivepiecesInteractionCoordinates;
  payload: Omit<StudioV2ActivepiecesInteractionPayload, "projectId" | "projectExternalId">;
}): Promise<unknown> {
  const environment = await findEnvironmentById(input.environmentId);
  if (!environment || environment.projectId !== input.projectId) {
    throw new StudioV2ActivepiecesInteractionError(
      "interaction_environment_not_found",
      404,
      "The Flowcordia runtime environment for this Studio interaction was not found."
    );
  }
  const artifact = createStudioV2ActivepiecesInteractionArtifact(input.coordinates);
  await ensureInteractionDeployment({ environment, actorId: input.actorId, artifact });

  const payload = {
    ...input.payload,
    projectId: input.projectId,
    projectExternalId: environment.project.externalRef,
  } as StudioV2ActivepiecesInteractionPayload;
  const trigger = await new TriggerTaskService().call(
    artifact.taskId,
    environment,
    { payload },
    {
      idempotencyKey: `flowcordia-ap-interaction:${randomUUID()}`,
      triggerSource: "flowcordia-studio",
      triggerAction: payload.operation,
    }
  );
  if (!trigger || trigger.isMollified) {
    throw new StudioV2ActivepiecesInteractionError(
      "interaction_trigger_failed",
      503,
      "Trigger.dev could not start the Activepieces Studio interaction.",
      true
    );
  }
  return decodeRunOutput(trigger.run.id);
}

export const studioV2ActivepiecesInteractionContract = {
  deploymentWaitMs: DEPLOYMENT_WAIT_MS,
  runWaitMs: RUN_WAIT_MS,
  pollMs: POLL_MS,
};
