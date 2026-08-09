import { isFlowcordiaActivepiecesPieceNode } from "@flowcordia/workflow";
import { CURRENT_DEPLOYMENT_LABEL } from "@trigger.dev/core/v3/isomorphic";
import { prisma } from "~/db.server";
import { ChangeCurrentDeploymentService } from "~/v3/services/changeCurrentDeployment.server";
import { ensureStudioV2ActivepiecesProductionBinding } from "./activepieces-production-binding.server";
import { StudioV2ActivepiecesInteractionError } from "./activepieces-interaction.server";
import { activepiecesConnectionEnvironmentName } from "./activepieces-connections.server";
import { deployStudioV2ReleaseNative } from "./native-deployment-service.server";
import {
  StudioV2ReleaseError,
  projectStudioV2Release,
  type StudioV2ReleaseProjection,
  type StudioV2ReleaseRecord,
} from "./release-contract";
import { prepareStudioV2Release } from "./release-preparation";
import {
  getLatestStudioV2Release,
  getStudioV2ReleaseByPublicId,
  listStudioV2Releases,
  recordStudioV2ReleaseRollback,
  reconcileStudioV2ReleaseDeployment,
  stageStudioV2ReleaseRecord,
} from "./release-repository.server";
import { studioV2CredentialRequirements } from "./release-credentials";
import {
  STUDIO_V2_WORKSPACE_KEY_PATTERN,
  StudioV2WorkspaceError,
  type StudioV2WorkspaceScope,
} from "./workspace-contract";
import { getStudioV2Workspace } from "./workspace-repository.server";

function assertReleaseScope(scope: StudioV2WorkspaceScope): void {
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

async function reconcileActivepiecesProductionBinding(
  release: StudioV2ReleaseRecord
): Promise<StudioV2ReleaseRecord> {
  if (release.status !== "DEPLOYED") return release;
  try {
    await ensureStudioV2ActivepiecesProductionBinding(release);
  } catch (error) {
    if (error instanceof StudioV2ActivepiecesInteractionError && error.retryable) {
      return release;
    }
    throw error;
  }
  return release;
}

async function assertStudioV2CredentialsReady(input: {
  scope: StudioV2WorkspaceScope;
  workflow: StudioV2ReleaseRecord["document"];
}): Promise<void> {
  const required = studioV2CredentialRequirements(input.workflow);
  if (!required.success) {
    throw new StudioV2ReleaseError(
      "credential_unavailable",
      `Credential reference "${required.reference}" cannot be shared by incompatible node types.`
    );
  }
  const activepiecesRequirements = input.workflow.nodes.flatMap((node) =>
    isFlowcordiaActivepiecesPieceNode(node)
      ? (node.credentialReferences ?? []).map((reference) => ({
          reference,
          environmentName: activepiecesConnectionEnvironmentName(reference),
        }))
      : []
  );
  const requirements = [...required.requirements, ...activepiecesRequirements];
  if (requirements.length === 0) return;

  const variables = await prisma.environmentVariable.findMany({
    where: {
      projectId: input.scope.projectId,
      key: { in: requirements.map(({ environmentName }) => environmentName) },
    },
    select: {
      key: true,
      values: {
        where: { environmentId: input.scope.environmentId },
        select: { isSecret: true },
        take: 1,
      },
    },
  });
  const available = new Map(
    variables.map((variable) => [variable.key, variable.values[0]?.isSecret === true] as const)
  );
  const unavailable = requirements.find(
    ({ environmentName }) => available.get(environmentName) !== true
  );
  if (unavailable) {
    throw new StudioV2ReleaseError(
      "credential_unavailable",
      `Credential reference "${unavailable.reference}" must be stored as a secret in this environment before staging.`
    );
  }
}

export async function loadLatestStudioV2Release(
  scope: StudioV2WorkspaceScope
): Promise<StudioV2ReleaseProjection | null> {
  assertReleaseScope(scope);
  const release = await getLatestStudioV2Release(scope);
  if (!release) return null;
  const reconciled = await reconcileStudioV2ReleaseDeployment(release);
  await reconcileActivepiecesProductionBinding(reconciled);
  return projectStudioV2Release(reconciled);
}

export async function stageStudioV2Workspace(input: {
  scope: StudioV2WorkspaceScope;
  expectedVersion: bigint;
  actorId: string;
}): Promise<StudioV2ReleaseProjection> {
  assertReleaseScope(input.scope);
  const workspace = await getStudioV2Workspace(input.scope);
  if (!workspace) {
    throw new StudioV2WorkspaceError(
      "workspace_not_found",
      "The Studio V2 workspace was not found."
    );
  }

  await assertStudioV2CredentialsReady({ scope: input.scope, workflow: workspace.document });

  const prepared = prepareStudioV2Release({
    workspace,
    expectedVersion: input.expectedVersion,
  });
  const staged = await stageStudioV2ReleaseRecord({
    prepared,
    actorId: input.actorId,
  });
  return projectStudioV2Release(staged.release);
}

export async function listStudioV2ReleaseHistory(
  scope: StudioV2WorkspaceScope
): Promise<StudioV2ReleaseProjection[]> {
  assertReleaseScope(scope);
  return (await listStudioV2Releases(scope)).map(projectStudioV2Release);
}

export async function loadCurrentStudioV2Release(
  scope: StudioV2WorkspaceScope
): Promise<StudioV2ReleaseProjection | null> {
  assertReleaseScope(scope);
  const promotion = await prisma.workerDeploymentPromotion.findUnique({
    where: {
      environmentId_label: {
        environmentId: scope.environmentId,
        label: CURRENT_DEPLOYMENT_LABEL,
      },
    },
    select: { deploymentId: true },
  });
  if (!promotion) return null;
  const release = (await listStudioV2Releases(scope)).find(
    (candidate) => candidate.deploymentId === promotion.deploymentId
  );
  return release ? projectStudioV2Release(release) : null;
}

export async function deployStudioV2Release(input: {
  scope: StudioV2WorkspaceScope;
  releasePublicId: string;
  actorId: string;
}): Promise<StudioV2ReleaseProjection> {
  assertReleaseScope(input.scope);
  const release = await deployStudioV2ReleaseNative(input);
  await reconcileActivepiecesProductionBinding(release);
  return projectStudioV2Release(release);
}

export async function rollbackStudioV2Release(input: {
  scope: StudioV2WorkspaceScope;
  releasePublicId: string;
  actorId: string;
}): Promise<StudioV2ReleaseProjection> {
  assertReleaseScope(input.scope);
  const release = await getStudioV2ReleaseByPublicId(input.scope, input.releasePublicId);
  if (!release || release.status !== "DEPLOYED" || !release.deploymentId) {
    throw new StudioV2ReleaseError(
      "release_not_found",
      "The deployed Studio V2 rollback target was not found."
    );
  }
  const deployment = await prisma.workerDeployment.findFirst({
    where: {
      id: release.deploymentId,
      projectId: input.scope.projectId,
      environmentId: input.scope.environmentId,
      status: "DEPLOYED",
    },
  });
  if (!deployment) {
    throw new StudioV2ReleaseError(
      "release_not_found",
      "The Trigger.dev deployment for this rollback target was not found."
    );
  }
  const current = await prisma.workerDeploymentPromotion.findUnique({
    where: {
      environmentId_label: {
        environmentId: input.scope.environmentId,
        label: CURRENT_DEPLOYMENT_LABEL,
      },
    },
    select: { deploymentId: true },
  });
  try {
    await new ChangeCurrentDeploymentService().call(deployment, "rollback");
  } catch (error) {
    throw new StudioV2ReleaseError(
      "release_conflict",
      error instanceof Error ? error.message : "The Studio V2 rollback could not be applied.",
      true
    );
  }
  await recordStudioV2ReleaseRollback({
    release,
    actorId: input.actorId,
    replacedDeploymentId: current?.deploymentId ?? null,
  });
  try {
    await ensureStudioV2ActivepiecesProductionBinding(release);
  } catch (error) {
    throw new StudioV2ReleaseError(
      "deployment_failed",
      `Rollback was applied, but the integration binding could not be restored: ${
        error instanceof Error ? error.message : "Unknown integration binding error."
      }`,
      true
    );
  }
  return projectStudioV2Release(release);
}
