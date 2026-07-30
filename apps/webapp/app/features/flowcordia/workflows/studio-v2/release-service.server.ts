import {
  projectStudioV2Release,
  type StudioV2ReleaseProjection,
} from "./release-contract";
import { prepareStudioV2Release } from "./release-preparation";
import {
  getLatestStudioV2Release,
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

export async function loadLatestStudioV2Release(
  scope: StudioV2WorkspaceScope
): Promise<StudioV2ReleaseProjection | null> {
  assertReleaseScope(scope);
  const release = await getLatestStudioV2Release(scope);
  return release ? projectStudioV2Release(release) : null;
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
