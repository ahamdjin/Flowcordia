import {
  ensureStudioV2ActivepiecesProductionBinding,
} from "./activepieces-production-binding.server";
import { StudioV2ActivepiecesInteractionError } from "./activepieces-interaction.server";
import { deployStudioV2ReleaseNative } from "./native-deployment-service.server";
import {
  projectStudioV2Release,
  type StudioV2ReleaseProjection,
  type StudioV2ReleaseRecord,
} from "./release-contract";
import { prepareStudioV2Release } from "./release-preparation";
import {
  getLatestStudioV2Release,
  reconcileStudioV2ReleaseDeployment,
  stageStudioV2ReleaseRecord,
} from "./release-repository.server";
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
