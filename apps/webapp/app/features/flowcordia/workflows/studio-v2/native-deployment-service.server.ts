import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { InitializeDeploymentRequestBody } from "@trigger.dev/core/v3";
import { findEnvironmentById } from "~/models/runtimeEnvironment.server";
import { ArtifactsService } from "~/v3/services/artifacts.server";
import { InitializeDeploymentService } from "~/v3/services/initializeDeployment.server";
import { createStudioV2DeploymentContext } from "./deployment-context.server";
import { StudioV2ReleaseError, type StudioV2ReleaseRecord } from "./release-contract";
import {
  attachStudioV2ReleaseDeployment,
  beginStudioV2ReleaseDeployment,
  failStudioV2ReleaseDeployment,
  reconcileStudioV2ReleaseDeployment,
} from "./release-repository.server";
import type { StudioV2WorkspaceScope } from "./workspace-contract";

function deploymentErrorMessage(error: unknown): string {
  if (error instanceof StudioV2ReleaseError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Trigger.dev could not initialize this Studio deployment.";
}

async function createArtifact(input: {
  environment: NonNullable<Awaited<ReturnType<typeof findEnvironmentById>>>;
  contentLength: number;
}) {
  return new ArtifactsService()
    .createArtifact("deployment_context", input.environment, input.contentLength)
    .match(
      (artifact) => artifact,
      (error) => {
        switch (error.type) {
          case "artifacts_bucket_not_configured":
            throw new StudioV2ReleaseError(
              "deployment_failed",
              "Deployment artifacts are not configured on this Flowcordia installation. Configure the artifacts object store and retry.",
              true
            );
          case "artifact_size_exceeds_limit":
            throw new StudioV2ReleaseError(
              "deployment_failed",
              `The Studio deployment context exceeds the ${error.sizeLimit} byte artifact limit.`
            );
          case "failed_to_create_presigned_post":
            throw new StudioV2ReleaseError(
              "deployment_failed",
              "Flowcordia could not create the deployment artifact upload. Retry after checking object storage.",
              true
            );
        }
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
    "flowcordia-studio-v2-context.tar.gz"
  );

  const response = await fetch(input.uploadUrl, { method: "POST", body: form });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new StudioV2ReleaseError(
      "deployment_failed",
      `The Studio deployment artifact upload failed with HTTP ${response.status}${
        details ? `: ${details}` : "."
      }`,
      true
    );
  }
}

function deploymentPayload(input: {
  release: StudioV2ReleaseRecord;
  actorId: string;
  artifactKey: string;
}): InitializeDeploymentRequestBody {
  return {
    contentHash: input.release.sourceSha256,
    userId: input.actorId,
    selfHosted: false,
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

export async function deployStudioV2ReleaseNative(input: {
  scope: StudioV2WorkspaceScope;
  releasePublicId: string;
  actorId: string;
}): Promise<StudioV2ReleaseRecord> {
  const environment = await findEnvironmentById(input.scope.environmentId);
  if (
    !environment ||
    environment.projectId !== input.scope.projectId ||
    environment.organizationId !== input.scope.organizationId
  ) {
    throw new StudioV2ReleaseError(
      "release_not_found",
      "The runtime environment for this Studio release was not found."
    );
  }

  const operationId = randomUUID();
  const release = await beginStudioV2ReleaseDeployment({
    scope: input.scope,
    releasePublicId: input.releasePublicId,
    operationId,
    actorId: input.actorId,
  });
  if (release.status === "DEPLOYED") return release;

  let context: Awaited<ReturnType<typeof createStudioV2DeploymentContext>> | undefined;
  try {
    context = await createStudioV2DeploymentContext({
      release,
      projectExternalRef: environment.project.externalRef,
    });
    const artifact = await createArtifact({
      environment,
      contentLength: context.contentLength,
    });
    await uploadDeploymentContext({
      uploadUrl: artifact.uploadUrl,
      uploadFields: artifact.uploadFields,
      archivePath: context.archivePath,
    });

    const initialized = await new InitializeDeploymentService().call(
      environment,
      deploymentPayload({ release, actorId: input.actorId, artifactKey: artifact.artifactKey })
    );
    const attached = await attachStudioV2ReleaseDeployment({
      releaseId: release.id,
      operationId,
      deploymentId: initialized.deployment.id,
    });
    return reconcileStudioV2ReleaseDeployment(attached);
  } catch (error) {
    await failStudioV2ReleaseDeployment({
      releaseId: release.id,
      operationId,
      message: deploymentErrorMessage(error),
    });
    if (error instanceof StudioV2ReleaseError) throw error;
    throw new StudioV2ReleaseError(
      "deployment_failed",
      deploymentErrorMessage(error),
      true
    );
  } finally {
    await context?.cleanup();
  }
}
