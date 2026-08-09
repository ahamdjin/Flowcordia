import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  TaskRunError,
  conditionallyImportPacket,
  taskRunErrorToString,
  type InitializeDeploymentRequestBody,
} from "@trigger.dev/core/v3";
import { parsePacketAsJson } from "@trigger.dev/core/v3/utils/ioSerialization";
import {
  compileStudioV2WorkflowToTriggerTask,
  type FlowcordiaExecutionResult,
  type FlowcordiaNodeTrace,
} from "@flowcordia/runtime";
import type { JsonValue } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import { authIncludeBase, toAuthenticated } from "~/models/runtimeEnvironment.server";
import { ArtifactsService } from "~/v3/services/artifacts.server";
import { CancelTaskRunService } from "~/v3/services/cancelTaskRun.server";
import { InitializeDeploymentService } from "~/v3/services/initializeDeployment.server";
import { TriggerTaskService } from "~/v3/services/triggerTask.server";
import { runStore } from "~/v3/runStore.server";
import { isFinalRunStatus } from "~/v3/taskStatus";
import { createStudioV2DeploymentContext } from "./deployment-context.server";
import { assertStudioV2CredentialsReady } from "./release-credentials.server";
import { StudioV2ReleaseError } from "./release-contract";
import {
  STUDIO_V2_WORKSPACE_KEY_PATTERN,
  StudioV2WorkspaceError,
  projectStudioV2Workspace,
  validateStudioV2WorkspaceDocument,
  type StudioV2WorkspaceProjection,
  type StudioV2WorkspaceRecord,
  type StudioV2WorkspaceScope,
} from "./workspace-contract";
import { getStudioV2Workspace, recordStudioV2WorkspaceTest } from "./workspace-repository.server";

const RECOVERABLE_DEPLOYMENT_STATUSES = [
  "PENDING",
  "INSTALLING",
  "BUILDING",
  "DEPLOYING",
  "DEPLOYED",
] as const;

type TestIdentity = {
  workspacePublicId: string;
  workspaceVersion: string;
  documentSha256: string;
};

export type StudioV2WorkflowTestResult =
  | { status: "warming"; message: string }
  | { status: "running"; runId: string; message: string }
  | {
      status: "completed";
      runId: string;
      success: boolean;
      execution: FlowcordiaExecutionResult;
      workspace: StudioV2WorkspaceProjection;
    };

export class StudioV2WorkflowTestError extends Error {
  constructor(
    readonly code:
      | "workflow_test_invalid"
      | "workflow_test_not_found"
      | "workflow_test_unavailable",
    readonly status: number,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "StudioV2WorkflowTestError";
  }
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

function deploymentIdentity(input: TestIdentity & { sourceSha256: string }): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        applicationRevision: applicationRevision(),
        ...input,
      })
    )
    .digest("hex");
}

function deploymentCommitSha(identity: string): string {
  return `flowcordia_studio_v2_test_${identity}`;
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
      commitMessage: "Prepare exact Flowcordia Studio workflow test runtime",
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

async function environmentForTest(scope: StudioV2WorkspaceScope) {
  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      id: scope.environmentId,
      projectId: scope.projectId,
      organizationId: scope.organizationId,
      archivedAt: null,
    },
    include: authIncludeBase,
  });
  if (!environment) {
    throw new StudioV2WorkflowTestError(
      "workflow_test_unavailable",
      404,
      "The Studio runtime environment was not found."
    );
  }
  return environment;
}

async function exactWorkspace(input: {
  scope: StudioV2WorkspaceScope;
  expectedVersion: bigint;
}): Promise<StudioV2WorkspaceRecord> {
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
      "The Studio V2 workspace changed before testing began. Test the latest saved version."
    );
  }
  return workspace;
}

async function createArtifact(input: {
  environment: Parameters<ArtifactsService["createArtifact"]>[1];
  contentLength: number;
}) {
  return new ArtifactsService()
    .createArtifact("deployment_context", input.environment, input.contentLength)
    .match(
      (artifact) => artifact,
      (): never => {
        throw new StudioV2WorkflowTestError(
          "workflow_test_unavailable",
          503,
          "Flowcordia could not prepare the workflow test deployment artifact.",
          true
        );
      }
    );
}

async function uploadContext(input: {
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
    "flowcordia-studio-v2-workflow-test.tar.gz"
  );
  const response = await fetch(input.uploadUrl, { method: "POST", body: form });
  if (!response.ok) {
    throw new StudioV2WorkflowTestError(
      "workflow_test_unavailable",
      503,
      `Flowcordia could not upload the workflow test runtime (HTTP ${response.status}).`,
      true
    );
  }
}

async function ensureTestTask(input: {
  scope: StudioV2WorkspaceScope;
  actorId: string;
  expectedVersion: bigint;
}) {
  const workspace = await exactWorkspace(input);
  const validated = validateStudioV2WorkspaceDocument(workspace.document);
  if (!validated.success) {
    throw new StudioV2WorkflowTestError(
      "workflow_test_invalid",
      400,
      validated.issues[0]?.message ?? "The Studio workflow is invalid."
    );
  }
  await assertStudioV2CredentialsReady({ scope: input.scope, workflow: validated.workflow });

  const compiled = compileStudioV2WorkflowToTriggerTask(validated.workflow, {
    environment: "test",
  });
  if (!compiled.success) {
    throw new StudioV2WorkflowTestError(
      "workflow_test_invalid",
      400,
      compiled.issues[0]?.message ?? "The Studio workflow could not be compiled for testing."
    );
  }
  const sourceSha256 = createHash("sha256").update(compiled.artifact.source).digest("hex");
  const identity = deploymentIdentity({
    workspacePublicId: workspace.publicId,
    workspaceVersion: workspace.version.toString(),
    documentSha256: workspace.documentSha256,
    sourceSha256,
  });
  const environment = await environmentForTest(input.scope);
  const existing = await prisma.workerDeployment.findFirst({
    where: {
      projectId: input.scope.projectId,
      environmentId: input.scope.environmentId,
      commitSHA: deploymentCommitSha(identity),
      contentHash: identity,
      status: { in: [...RECOVERABLE_DEPLOYMENT_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
    select: { status: true, version: true, workerId: true },
  });
  if (existing) {
    if (existing.status !== "DEPLOYED" || !existing.workerId) {
      return {
        status: "warming" as const,
        message: "Trigger.dev is preparing the exact saved workflow test worker.",
      };
    }
    const installed = await prisma.backgroundWorkerTask.findFirst({
      where: {
        projectId: input.scope.projectId,
        runtimeEnvironmentId: input.scope.environmentId,
        workerId: existing.workerId,
        slug: compiled.artifact.taskId,
      },
      select: { id: true },
    });
    if (!installed) {
      return {
        status: "warming" as const,
        message: "The exact workflow test task is still being installed.",
      };
    }
    return { status: "ready" as const, workspace, environment, compiled, deployment: existing };
  }

  let context: Awaited<ReturnType<typeof createStudioV2DeploymentContext>> | undefined;
  try {
    context = await createStudioV2DeploymentContext({
      release: {
        document: validated.workflow,
        generatedSource: compiled.artifact.source,
      },
      projectExternalRef: environment.project.externalRef,
    });
    const artifact = await createArtifact({
      environment,
      contentLength: context.contentLength,
    });
    await uploadContext({
      uploadUrl: artifact.uploadUrl,
      uploadFields: artifact.uploadFields,
      archivePath: context.archivePath,
    });
    await new InitializeDeploymentService().call(
      environment,
      deploymentPayload({ identity, actorId: input.actorId, artifactKey: artifact.artifactKey })
    );
  } catch (error) {
    if (
      error instanceof StudioV2WorkflowTestError ||
      error instanceof StudioV2WorkspaceError ||
      error instanceof StudioV2ReleaseError
    ) {
      throw error;
    }
    throw new StudioV2WorkflowTestError(
      "workflow_test_unavailable",
      503,
      error instanceof Error
        ? `Flowcordia could not prepare the workflow test runtime: ${error.message}`
        : "Flowcordia could not prepare the workflow test runtime.",
      true
    );
  } finally {
    await context?.cleanup();
  }

  return {
    status: "warming" as const,
    message: "Trigger.dev is preparing the exact saved workflow test worker.",
  };
}

function identityMetadata(workspace: StudioV2WorkspaceRecord): TestIdentity {
  return {
    workspacePublicId: workspace.publicId,
    workspaceVersion: workspace.version.toString(),
    documentSha256: workspace.documentSha256,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return isRecord(value) ? value : null;
}

function metadataMatches(value: unknown, expected: TestIdentity): boolean {
  const metadata = parseMetadata(value)?.flowcordiaStudioWorkflowTest;
  return (
    isRecord(metadata) &&
    metadata.workspacePublicId === expected.workspacePublicId &&
    metadata.workspaceVersion === expected.workspaceVersion &&
    metadata.documentSha256 === expected.documentSha256
  );
}

function traceStatus(value: unknown): FlowcordiaNodeTrace["status"] | null {
  return ["SUCCEEDED", "SKIPPED", "FAILED", "CANCELLED"].includes(String(value))
    ? (value as FlowcordiaNodeTrace["status"])
    : null;
}

function tracesFromMetadata(value: unknown): FlowcordiaNodeTrace[] {
  const traces = parseMetadata(value)?.flowcordia;
  if (!isRecord(traces) || !Array.isArray(traces.traces)) return [];
  return traces.traces.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const status = traceStatus(candidate.status);
    if (
      !status ||
      typeof candidate.nodeId !== "string" ||
      typeof candidate.operation !== "string" ||
      typeof candidate.startedAt !== "string" ||
      typeof candidate.completedAt !== "string" ||
      typeof candidate.durationMs !== "number"
    ) {
      return [];
    }
    return [
      {
        nodeId: candidate.nodeId,
        operation: candidate.operation,
        status,
        startedAt: candidate.startedAt,
        completedAt: candidate.completedAt,
        durationMs: candidate.durationMs,
        ...(typeof candidate.message === "string" ? { message: candidate.message } : {}),
      },
    ];
  });
}

function jsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

async function testedRun(input: {
  scope: StudioV2WorkspaceScope;
  workspace: StudioV2WorkspaceRecord;
  runId: string;
}) {
  const run = await runStore.findRun(
    {
      friendlyId: input.runId,
      projectId: input.scope.projectId,
      runtimeEnvironmentId: input.scope.environmentId,
    },
    {
      select: {
        id: true,
        friendlyId: true,
        status: true,
        output: true,
        outputType: true,
        error: true,
        metadata: true,
        createdAt: true,
        completedAt: true,
        engine: true,
        taskEventStore: true,
      },
    },
    prisma
  );
  if (!run || !metadataMatches(run.metadata, identityMetadata(input.workspace))) {
    throw new StudioV2WorkflowTestError(
      "workflow_test_not_found",
      404,
      "The version-locked Studio workflow test run was not found."
    );
  }
  return run;
}

function failureMessage(error: unknown, fallback: string): string {
  const parsed = TaskRunError.safeParse(error);
  return parsed.success ? taskRunErrorToString(parsed.data) : fallback;
}

export async function startStudioV2WorkflowTest(input: {
  scope: StudioV2WorkspaceScope;
  actorId: string;
  expectedVersion: bigint;
  testInput: JsonValue;
}): Promise<StudioV2WorkflowTestResult> {
  const ready = await ensureTestTask(input);
  if (ready.status === "warming") return ready;

  const idempotencyKey = `flowcordia-studio-workflow-test:${randomUUID()}`;
  const triggered = await new TriggerTaskService().call(
    ready.compiled.artifact.taskId,
    toAuthenticated(ready.environment),
    {
      payload: JSON.stringify(input.testInput),
      options: {
        payloadType: "application/json",
        lockToVersion: ready.deployment.version,
        idempotencyKey,
        idempotencyKeyTTL: "10m",
        metadata: {
          flowcordiaStudioWorkflowTest: identityMetadata(ready.workspace),
        },
      },
    },
    {
      idempotencyKey,
      idempotencyKeyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      triggerSource: "dashboard",
      triggerAction: "flowcordia_studio_workflow_test",
    }
  );
  if (!triggered) {
    return { status: "warming", message: "The exact workflow test task is not ready yet." };
  }
  return {
    status: "running",
    runId: triggered.run.friendlyId,
    message: `Run ${triggered.run.friendlyId} is executing on Trigger.dev.`,
  };
}

export async function readStudioV2WorkflowTest(input: {
  scope: StudioV2WorkspaceScope;
  actorId: string;
  expectedVersion: bigint;
  runId: string;
}): Promise<StudioV2WorkflowTestResult> {
  const workspace = await exactWorkspace(input);
  const run = await testedRun({ scope: input.scope, workspace, runId: input.runId });
  if (!isFinalRunStatus(run.status)) {
    return {
      status: "running",
      runId: run.friendlyId,
      message: `Run ${run.friendlyId} is ${run.status.toLowerCase().replaceAll("_", " ")}.`,
    };
  }

  const traces = tracesFromMetadata(run.metadata);
  const cancelled = run.status === "CANCELED";
  const success = run.status === "COMPLETED_SUCCESSFULLY";
  let output: JsonValue = null;
  if (success) {
    const packet = await conditionallyImportPacket({
      data: run.output ?? undefined,
      dataType: run.outputType ?? undefined,
    });
    output = jsonValue(await parsePacketAsJson(packet));
  } else if (traces.length === 0) {
    const completedAt = new Date().toISOString();
    traces.push({
      nodeId: "workflow",
      operation: "trigger.execution",
      status: cancelled ? "CANCELLED" : "FAILED",
      startedAt: completedAt,
      completedAt,
      durationMs: 0,
      message: cancelled
        ? "Workflow test was cancelled."
        : failureMessage(run.error, `Workflow test ended with status ${run.status}.`),
    });
  }
  const execution: FlowcordiaExecutionResult = {
    success,
    workflowId: workspace.document.id,
    mode: "live",
    output,
    traces,
    runId: run.friendlyId,
    ...(success ? {} : { failedNodeId: traces.at(-1)?.nodeId ?? "workflow" }),
    ...(cancelled ? { cancelled: true } : {}),
  };
  const tested = await recordStudioV2WorkspaceTest({
    scope: input.scope,
    expectedVersion: input.expectedVersion,
    actorId: input.actorId,
    success,
    issueCount: success ? 0 : 1,
  });
  return {
    status: "completed",
    runId: run.friendlyId,
    success,
    execution,
    workspace: projectStudioV2Workspace(tested),
  };
}

export async function cancelStudioV2WorkflowTest(input: {
  scope: StudioV2WorkspaceScope;
  expectedVersion: bigint;
  runId: string;
}): Promise<{ runId: string; cancelled: true }> {
  const workspace = await exactWorkspace(input);
  const run = await testedRun({ scope: input.scope, workspace, runId: input.runId });
  if (!isFinalRunStatus(run.status)) await new CancelTaskRunService().call(run);
  return { runId: run.friendlyId, cancelled: true };
}
