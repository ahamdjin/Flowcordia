import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { InitializeDeploymentRequestBody } from "@trigger.dev/core/v3";
import { validateStudioV2SourceDocument, type JsonValue } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { authIncludeBase, toAuthenticated } from "~/models/runtimeEnvironment.server";
import { ArtifactsService } from "~/v3/services/artifacts.server";
import { InitializeDeploymentService } from "~/v3/services/initializeDeployment.server";
import { TriggerTaskService } from "~/v3/services/triggerTask.server";
import {
  createStudioV2SourceTestContext,
  STUDIO_V2_SOURCE_TEST_TASK_ID,
} from "./source-test-context.server";
import {
  STUDIO_V2_WORKSPACE_KEY_PATTERN,
  StudioV2WorkspaceError,
  type StudioV2WorkspaceScope,
} from "./workspace-contract";
import { getStudioV2Workspace } from "./workspace-repository.server";

const RECOVERABLE_DEPLOYMENT_STATUSES = [
  "PENDING",
  "INSTALLING",
  "BUILDING",
  "DEPLOYING",
  "DEPLOYED",
] as const;
const RESULT_POLL_INTERVAL_MS = 250;
const RESULT_POLL_ATTEMPTS = 240;

export type StudioV2SourceTestResult =
  | {
      status: "warming";
      message: string;
    }
  | {
      status: "completed";
      runId: string;
      success: true;
      output: JsonValue;
      updatedAt?: string;
    }
  | {
      status: "completed";
      runId: string;
      success: false;
      message: string;
      updatedAt?: string;
    };

export type StudioV2SourceTestErrorCode =
  | "source_test_invalid"
  | "source_test_failed"
  | "source_test_unavailable";

export class StudioV2SourceTestError extends Error {
  constructor(
    readonly code: StudioV2SourceTestErrorCode,
    readonly status: number,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "StudioV2SourceTestError";
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertScope(scope: StudioV2WorkspaceScope): void {
  if (
    !scope.organizationId ||
    !scope.projectId ||
    !scope.environmentId ||
    !STUDIO_V2_WORKSPACE_KEY_PATTERN.test(scope.workspaceKey)
  ) {
    throw new StudioV2WorkspaceError(
      "invalid_workspace",
      "The Studio V2 workspace scope is invalid."
    );
  }
}

function applicationRevision(): string {
  const revision = process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA?.trim();
  return revision && /^[0-9a-f]{40}$/i.test(revision) ? revision.toLowerCase() : "development";
}

function deploymentIdentity(input: {
  workflowId: string;
  nodeId: string;
  document: unknown;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        applicationRevision: applicationRevision(),
        workflowId: input.workflowId,
        nodeId: input.nodeId,
        document: input.document,
      })
    )
    .digest("hex");
}

function deploymentCommitSha(identity: string): string {
  return `flowcordia_studio_v2_source_test_${identity}`;
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
      commitMessage: "Prepare Flowcordia Studio Source test runtime",
      dirty: false,
    },
    type: "MANAGED",
    initialStatus: "PENDING",
    isLocalBuild: false,
    triggeredVia: "dashboard",
    isNativeBuild: true,
    skipPromotion: true,
    artifactKey: input.artifactKey,
    configFilePath: "trigger.config.ts",
    skipEnqueue: false,
  };
}

async function uploadTestContext(input: {
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
    "flowcordia-studio-v2-source-test.tar.gz"
  );
  const response = await fetch(input.uploadUrl, { method: "POST", body: form });
  if (!response.ok) {
    throw new StudioV2SourceTestError(
      "source_test_unavailable",
      503,
      `Flowcordia could not upload the Source test runtime (HTTP ${response.status}).`,
      true
    );
  }
}

async function createTestArtifact(input: {
  environment: Parameters<ArtifactsService["createArtifact"]>[1];
  contentLength: number;
}) {
  return new ArtifactsService()
    .createArtifact("deployment_context", input.environment, input.contentLength)
    .match(
      (artifact) => artifact,
      (): never => {
        throw new StudioV2SourceTestError(
          "source_test_unavailable",
          503,
          "Flowcordia could not prepare the Source test deployment artifact.",
          true
        );
      }
    );
}

async function sourceTestEnvironment(input: { projectId: string; environmentId: string }) {
  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      id: input.environmentId,
      projectId: input.projectId,
      archivedAt: null,
    },
    include: authIncludeBase,
  });
  if (!environment) {
    throw new StudioV2SourceTestError(
      "source_test_unavailable",
      404,
      "The Studio runtime environment was not found."
    );
  }
  return environment;
}

function sourceDefinition(workspace: NonNullable<Awaited<ReturnType<typeof getStudioV2Workspace>>>) {
  const node = workspace.document.nodes.find((candidate) => candidate.operation === "code.typescript");
  if (!node) {
    throw new StudioV2SourceTestError(
      "source_test_invalid",
      400,
      "This workflow does not contain a TypeScript Source node to test."
    );
  }
  const validation = validateStudioV2SourceDocument(node.configuration);
  if (!validation.success) {
    throw new StudioV2SourceTestError(
      "source_test_invalid",
      400,
      validation.issues[0]?.message ?? "The TypeScript Source document is invalid."
    );
  }
  return { node, document: validation.document };
}

async function ensureSourceTestTask(input: {
  scope: StudioV2WorkspaceScope;
  actorId: string;
  expectedVersion: bigint;
}) {
  assertScope(input.scope);
  const workspace = await getStudioV2Workspace(input.scope);
  if (!workspace) {
    throw new StudioV2WorkspaceError(
      "workspace_not_found",
      "The Studio V2 workspace was not found."
    );
  }
  if (workspace.version !== input.expectedVersion) {
    throw new StudioV2WorkspaceError(
      "workspace_conflict",
      "The Studio V2 workspace changed before Source testing began. Reload and test the latest saved version."
    );
  }

  const source = sourceDefinition(workspace);
  const environment = await sourceTestEnvironment({
    projectId: input.scope.projectId,
    environmentId: input.scope.environmentId,
  });
  const identity = deploymentIdentity({
    workflowId: workspace.document.id,
    nodeId: source.node.id,
    document: source.document,
  });
  const existing = await prisma.workerDeployment.findFirst({
    where: {
      projectId: input.scope.projectId,
      environmentId: input.scope.environmentId,
      commitSHA: deploymentCommitSha(identity),
      contentHash: identity,
      status: { in: [...RECOVERABLE_DEPLOYMENT_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, version: true, workerId: true },
  });

  if (existing) {
    if (existing.status !== "DEPLOYED" || !existing.workerId) {
      return {
        status: "warming" as const,
        message: "Trigger.dev is preparing the exact Source test worker.",
      };
    }
    const installed = await prisma.backgroundWorkerTask.findFirst({
      where: {
        projectId: input.scope.projectId,
        runtimeEnvironmentId: input.scope.environmentId,
        workerId: existing.workerId,
        slug: STUDIO_V2_SOURCE_TEST_TASK_ID,
      },
      select: { id: true },
    });
    if (!installed) {
      return {
        status: "warming" as const,
        message: "The exact Source test task is still being installed.",
      };
    }
    return { status: "ready" as const, environment, deployment: existing };
  }

  let context: Awaited<ReturnType<typeof createStudioV2SourceTestContext>> | undefined;
  try {
    context = await createStudioV2SourceTestContext({
      projectExternalRef: environment.project.externalRef,
      workflowId: workspace.document.id,
      nodeId: source.node.id,
      document: source.document,
    });
    const artifact = await createTestArtifact({
      environment,
      contentLength: context.contentLength,
    });
    await uploadTestContext({
      uploadUrl: artifact.uploadUrl,
      uploadFields: artifact.uploadFields,
      archivePath: context.archivePath,
    });
    await new InitializeDeploymentService().call(
      environment,
      deploymentPayload({ identity, actorId: input.actorId, artifactKey: artifact.artifactKey })
    );
  } catch (error) {
    if (error instanceof StudioV2SourceTestError) throw error;
    throw new StudioV2SourceTestError(
      "source_test_unavailable",
      503,
      error instanceof Error
        ? `Flowcordia could not prepare the Source test runtime: ${error.message}`
        : "Flowcordia could not prepare the Source test runtime.",
      true
    );
  } finally {
    await context?.cleanup();
  }

  return {
    status: "warming" as const,
    message: "Trigger.dev is preparing the exact Source test worker.",
  };
}

function parseSourceTestMetadata(value: unknown, requestId: string) {
  if (!isRecord(value)) return null;
  const metadata = value.flowcordiaStudioSourceTest;
  if (!isRecord(metadata) || metadata.requestId !== requestId) return null;
  const updatedAt = typeof metadata.updatedAt === "string" ? metadata.updatedAt : undefined;
  if (metadata.status === "FAILED") {
    return {
      status: "FAILED" as const,
      message:
        typeof metadata.message === "string" ? metadata.message : "TypeScript Source test failed.",
      updatedAt,
    };
  }
  if (metadata.status !== "SUCCEEDED" || typeof metadata.result !== "string") return null;
  try {
    return {
      status: "SUCCEEDED" as const,
      result: JSON.parse(metadata.result) as JsonValue,
      updatedAt,
    };
  } catch {
    return {
      status: "FAILED" as const,
      message: "Source test returned invalid result metadata.",
      updatedAt,
    };
  }
}

export async function executeStudioV2SourceTest(input: {
  scope: StudioV2WorkspaceScope;
  actorId: string;
  expectedVersion: bigint;
}): Promise<StudioV2SourceTestResult> {
  const ready = await ensureSourceTestTask(input);
  if (ready.status === "warming") return ready;

  const requestId = randomUUID();
  const idempotencyKey = `flowcordia-studio-source-test:${requestId}`;
  const triggered = await new TriggerTaskService().call(
    STUDIO_V2_SOURCE_TEST_TASK_ID,
    toAuthenticated(ready.environment),
    {
      payload: JSON.stringify({ requestId, input: null }),
      options: {
        payloadType: "application/json",
        lockToVersion: ready.deployment.version,
        idempotencyKey,
        idempotencyKeyTTL: "10m",
        metadata: {
          flowcordiaStudioSourceTest: {
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
      triggerAction: "flowcordia_studio_source_test",
    }
  );
  if (!triggered) {
    return {
      status: "warming",
      message: "The exact Source test task is not available on the worker version yet.",
    };
  }

  for (let attempt = 0; attempt < RESULT_POLL_ATTEMPTS; attempt += 1) {
    const run = await prisma.taskRun.findUnique({
      where: { id: triggered.run.id },
      select: { metadata: true },
    });
    const result = parseSourceTestMetadata(run?.metadata, requestId);
    if (result?.status === "SUCCEEDED") {
      return {
        status: "completed",
        runId: triggered.run.id,
        success: true,
        output: result.result,
        updatedAt: result.updatedAt,
      };
    }
    if (result?.status === "FAILED") {
      return {
        status: "completed",
        runId: triggered.run.id,
        success: false,
        message: result.message,
        updatedAt: result.updatedAt,
      };
    }
    await sleep(RESULT_POLL_INTERVAL_MS);
  }

  throw new StudioV2SourceTestError(
    "source_test_unavailable",
    503,
    "The Source test did not finish within the bounded Studio request window.",
    true
  );
}
