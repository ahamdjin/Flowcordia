import { createHash } from "node:crypto";
import { listWorkflowIndexEntries } from "../index/repository.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import { presentWorkflowIndexEntry, type WorkflowStudioListItem } from "../studio/presentation";
import {
  STUDIO_V2_DEFAULT_WORKSPACE_KEY,
  STUDIO_V2_WORKSPACE_KEY_PATTERN,
  projectStudioV2Workspace,
} from "./workspace-contract";
import { listStudioV2Workspaces } from "./workspace-repository.server";

export type StudioV2WorkflowCatalogItem = WorkflowStudioListItem & {
  workspaceKey: string;
};

export interface StudioV2WorkflowCatalog {
  workflows: StudioV2WorkflowCatalogItem[];
  error: string | null;
}

export async function queryStudioV2WorkflowCatalog(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
}): Promise<StudioV2WorkflowCatalog> {
  const localWorkspaces = await listStudioV2Workspaces(input);
  let repositoryWorkflows: StudioV2WorkflowCatalogItem[] = [];
  let catalogError: string | null = null;
  try {
    const scope = await resolveWorkflowIndexScope(input);
    const entries = await listWorkflowIndexEntries(scope);
    repositoryWorkflows = entries.map((entry) => {
      const workflow = presentWorkflowIndexEntry(entry);
      return {
        ...workflow,
        workspaceKey: studioV2WorkspaceKeyForWorkflow(workflow.workflowId),
      };
    });
  } catch (error) {
    catalogError =
      error instanceof Error ? error.message : "Repository workflows could not be loaded.";
  }

  const knownWorkspaceKeys = new Set(repositoryWorkflows.map((workflow) => workflow.workspaceKey));
  const localOnlyWorkflows = localWorkspaces
    .filter((workspace) => !knownWorkspaceKeys.has(workspace.scope.workspaceKey))
    .map((workspace): StudioV2WorkflowCatalogItem => {
      const projection = projectStudioV2Workspace(workspace);
      return {
        workspaceKey: projection.workspaceKey,
        workflowId:
          typeof projection.document.id === "string"
            ? projection.document.id
            : projection.workspaceKey,
        name:
          typeof projection.document.name === "string"
            ? projection.document.name
            : "Untitled workflow",
        description:
          typeof projection.document.description === "string"
            ? projection.document.description
            : null,
        status: "VALID",
        schemaVersion:
          typeof projection.document.schemaVersion === "string"
            ? projection.document.schemaVersion
            : null,
        nodeCount: Array.isArray(projection.document.nodes)
          ? projection.document.nodes.length
          : null,
        edgeCount: Array.isArray(projection.document.edges)
          ? projection.document.edges.length
          : null,
        indexedAt: projection.updatedAt,
        sourceCommitSha: "",
        failure: null,
      };
    });

  return {
    workflows: [...localOnlyWorkflows, ...repositoryWorkflows],
    error: catalogError,
  };
}

export function studioV2WorkspaceKeyForWorkflow(workflowId: string | null | undefined): string {
  if (!workflowId) return STUDIO_V2_DEFAULT_WORKSPACE_KEY;
  if (STUDIO_V2_WORKSPACE_KEY_PATTERN.test(workflowId)) return workflowId;
  const digest = createHash("sha256").update(workflowId).digest("hex").slice(0, 48);
  return `workflow_${digest}`;
}
