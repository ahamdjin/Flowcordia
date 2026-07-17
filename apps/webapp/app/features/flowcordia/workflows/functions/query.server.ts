import type { WorkflowDraftScope } from "../drafts/types";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import {
  presentWorkflowFunctionCatalog,
  presentWorkflowFunctionCatalogError,
  type WorkflowFunctionCatalogProjection,
} from "./presentation";

export async function queryWorkflowFunctionCatalog(input: {
  scope: WorkflowDraftScope;
  revision: string;
}): Promise<WorkflowFunctionCatalogProjection> {
  const { functionCatalog } = await createWorkflowIndexGitHubGateway(input.scope);
  const result = await functionCatalog.read({ scope: input.scope, revision: input.revision });
  if (!result.success) return presentWorkflowFunctionCatalogError(result.error);
  if (
    result.value.source.requestedRevision !== input.revision ||
    result.value.source.commitSha !== input.revision
  ) {
    return {
      state: "INVALID",
      functions: [],
      source: null,
      message: "The function catalog did not resolve to the workflow's exact source revision.",
      retryable: false,
    };
  }
  return presentWorkflowFunctionCatalog(result.value);
}
