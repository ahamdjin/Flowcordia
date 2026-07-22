import type {
  WorkflowStudioNodeCatalogCategory,
  WorkflowStudioNodeCatalogReleaseStage,
  WorkflowStudioNodeTemplate,
} from "@flowcordia/workflow";

export type WorkflowStudioCatalogCategoryFilter = WorkflowStudioNodeCatalogCategory | "all";
export type WorkflowStudioCatalogStageFilter = WorkflowStudioNodeCatalogReleaseStage | "all";

export interface WorkflowStudioCatalogDiscoveryInput {
  query: string;
  category: WorkflowStudioCatalogCategoryFilter;
  stage: WorkflowStudioCatalogStageFilter;
}

function searchableText(template: WorkflowStudioNodeTemplate): string {
  return [
    template.label,
    template.description,
    template.catalogId,
    template.operation,
    template.category,
    template.releaseStage,
    ...template.capabilities,
  ]
    .join(" ")
    .toLocaleLowerCase("en-US");
}

export function discoverWorkflowStudioCatalog(
  catalog: readonly WorkflowStudioNodeTemplate[],
  input: WorkflowStudioCatalogDiscoveryInput
): readonly WorkflowStudioNodeTemplate[] {
  const query = input.query.trim().toLocaleLowerCase("en-US");
  return catalog.filter((template) => {
    if (input.category !== "all" && template.category !== input.category) return false;
    if (input.stage !== "all" && template.releaseStage !== input.stage) return false;
    return query.length === 0 || searchableText(template).includes(query);
  });
}

export function firstAvailableWorkflowStudioTemplateId(input: {
  catalog: readonly WorkflowStudioNodeTemplate[];
  currentTemplateId: string;
}): string | null {
  if (input.catalog.some((template) => template.id === input.currentTemplateId)) {
    return input.currentTemplateId;
  }
  return input.catalog[0]?.id ?? null;
}
