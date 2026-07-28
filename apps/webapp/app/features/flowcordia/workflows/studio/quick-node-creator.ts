import {
  WORKFLOW_STUDIO_NODE_CATALOG,
  type WorkflowStudioNodeCatalogCategory,
  type WorkflowStudioNodeTemplate,
  type WorkflowStudioTemplateId,
} from "@flowcordia/workflow";

export type WorkflowStudioQuickCreateContext = "standalone" | "after_source" | "on_edge";
export type WorkflowStudioQuickCreateCategory = "all" | WorkflowStudioNodeCatalogCategory;

function supportsContext(
  template: WorkflowStudioNodeTemplate,
  context: WorkflowStudioQuickCreateContext
): boolean {
  if (context === "standalone") return true;
  if (template.kind === "trigger") return false;
  if (context === "on_edge") {
    return template.kind !== "output" && template.operation !== "control.condition";
  }
  return true;
}

export function workflowStudioQuickNodeTemplates({
  context,
  query,
  category,
}: {
  context: WorkflowStudioQuickCreateContext;
  query: string;
  category: WorkflowStudioQuickCreateCategory;
}): readonly WorkflowStudioNodeTemplate[] {
  const normalizedQuery = query.trim().toLowerCase();
  return WORKFLOW_STUDIO_NODE_CATALOG.filter((template) => {
    if (!supportsContext(template, context)) return false;
    if (category !== "all" && template.category !== category) return false;
    if (!normalizedQuery) return true;
    return [
      template.id,
      template.label,
      template.description,
      template.operation,
      template.category,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }).sort((left, right) => {
    if (left.releaseStage !== right.releaseStage) {
      return left.releaseStage === "approved" ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

export function rememberWorkflowStudioQuickTemplate(
  current: readonly WorkflowStudioTemplateId[],
  templateId: WorkflowStudioTemplateId,
  limit = 5
): WorkflowStudioTemplateId[] {
  return [templateId, ...current.filter((candidate) => candidate !== templateId)].slice(0, limit);
}
