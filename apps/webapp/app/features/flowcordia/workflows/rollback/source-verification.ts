import type {
  GitHubRepositorySourcePatch,
  GitHubRepositorySourcePatchStore,
} from "@flowcordia/github-workflows";
import type { WorkflowIndexScope } from "../index/types";
import { FlowcordiaRollbackError } from "./errors";

export async function assertFlowcordiaRollbackSourcePatchesAtHead(input: {
  scope: WorkflowIndexScope;
  sourcePatchStore: Pick<GitHubRepositorySourcePatchStore, "read">;
  sourcePatches: readonly GitHubRepositorySourcePatch[];
  proposalHeadSha: string;
}): Promise<void> {
  for (const patch of input.sourcePatches) {
    const verified = await input.sourcePatchStore.read({
      scope: input.scope,
      path: patch.path,
      revision: input.proposalHeadSha,
    });
    if (!verified.success) {
      throw new FlowcordiaRollbackError(
        "source_snapshot_unavailable",
        "The rollback proposal source set could not be verified at its exact GitHub head.",
        verified.error.retryable ? 503 : 409,
        verified.error.retryable
      );
    }
    if (
      verified.value.commitSha !== input.proposalHeadSha ||
      verified.value.sourceText !== patch.sourceText
    ) {
      throw new FlowcordiaRollbackError(
        "source_snapshot_unavailable",
        "The rollback proposal does not contain the exact governed source patch set.",
        409,
        false
      );
    }
  }
}
