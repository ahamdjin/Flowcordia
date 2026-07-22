import {
  WORKFLOW_STUDIO_NODE_CATALOG,
  type WorkflowStudioNodeCapability,
  type WorkflowStudioNodeCatalogCategory,
  type WorkflowStudioNodeCatalogReleaseStage,
  type WorkflowStudioTemplateId,
} from "@flowcordia/workflow";
import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import {
  discoverWorkflowStudioCatalog,
  firstAvailableWorkflowStudioTemplateId,
  type WorkflowStudioCatalogCategoryFilter,
  type WorkflowStudioCatalogStageFilter,
} from "./node-catalog-discovery";

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400";

const CATEGORIES: readonly {
  id: WorkflowStudioNodeCatalogCategory;
  label: string;
}[] = [
  { id: "trigger", label: "Triggers" },
  { id: "action", label: "Actions" },
  { id: "logic", label: "Logic" },
  { id: "output", label: "Output" },
];

const CAPABILITY_LABELS: Record<WorkflowStudioNodeCapability, string> = {
  structural_preview: "Structural preview",
  live_execution: "Live execution",
  credential_references: "Credentials",
  governed_code_generation: "Generated code",
  production_binding: "Production binding",
};

export function WorkflowStudioNodeCatalogPicker({
  selectedTemplateId,
  disabled,
  busy,
  onSelect,
  onAdd,
}: {
  selectedTemplateId: WorkflowStudioTemplateId;
  disabled: boolean;
  busy: boolean;
  onSelect: (templateId: WorkflowStudioTemplateId) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WorkflowStudioCatalogCategoryFilter>("all");
  const [stage, setStage] = useState<WorkflowStudioCatalogStageFilter>("all");
  const results = useMemo(
    () => discoverWorkflowStudioCatalog(WORKFLOW_STUDIO_NODE_CATALOG, { query, category, stage }),
    [category, query, stage]
  );
  const availableTemplateId = firstAvailableWorkflowStudioTemplateId({
    catalog: results,
    currentTemplateId: selectedTemplateId,
  });
  const selectedTemplate = WORKFLOW_STUDIO_NODE_CATALOG.find(
    (template) => template.id === availableTemplateId
  );

  useEffect(() => {
    if (!availableTemplateId || availableTemplateId === selectedTemplateId) return;
    onSelect(availableTemplateId as WorkflowStudioTemplateId);
  }, [availableTemplateId, onSelect, selectedTemplateId]);

  return (
    <div
      data-testid="flowcordia-node-catalog-picker"
      data-result-count={results.length}
      className="w-full"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
            Find an approved capability
          </span>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-text-dimmed"
              aria-hidden="true"
            />
            <input
              data-testid="flowcordia-node-catalog-search"
              type="search"
              className={cn(inputClassName, "pl-8")}
              value={query}
              disabled={disabled}
              placeholder="Search HTTP, schedule, credentials…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </label>
        <label className="w-36">
          <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
            Category
          </span>
          <select
            data-testid="flowcordia-node-catalog-category"
            className={inputClassName}
            value={category}
            disabled={disabled}
            onChange={(event) =>
              setCategory(event.target.value as WorkflowStudioCatalogCategoryFilter)
            }
          >
            <option value="all">All</option>
            {CATEGORIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="w-32">
          <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
            Stage
          </span>
          <select
            data-testid="flowcordia-node-catalog-stage"
            className={inputClassName}
            value={stage}
            disabled={disabled}
            onChange={(event) =>
              setStage(event.target.value as WorkflowStudioNodeCatalogReleaseStage | "all")
            }
          >
            <option value="all">All</option>
            <option value="approved">Approved</option>
            <option value="limited">Limited</option>
          </select>
        </label>
      </div>

      {results.length === 0 ? (
        <div
          data-testid="flowcordia-node-catalog-empty"
          className="mt-3 rounded border border-grid-dimmed bg-background-bright px-3 py-3 text-xs text-text-dimmed"
        >
          No node matches this search. Clear a filter to return to the versioned catalog.
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)_auto] lg:items-start">
          <label>
            <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
              {results.length} matching node{results.length === 1 ? "" : "s"}
            </span>
            <select
              id="flowcordia-node-catalog"
              data-testid="flowcordia-node-catalog-results"
              className={inputClassName}
              value={availableTemplateId ?? ""}
              disabled={disabled}
              onChange={(event) => onSelect(event.target.value as WorkflowStudioTemplateId)}
            >
              {CATEGORIES.map((entry) => {
                const templates = results.filter((template) => template.category === entry.id);
                if (templates.length === 0) return null;
                return (
                  <optgroup key={entry.id} label={entry.label}>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                        {template.releaseStage === "limited" ? " — limited" : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>

          {selectedTemplate ? (
            <div className="rounded border border-grid-dimmed bg-background-bright px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xxs">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-medium",
                    selectedTemplate.releaseStage === "approved"
                      ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                      : "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
                  )}
                >
                  {selectedTemplate.releaseStage === "approved" ? "Approved" : "Limited"}
                </span>
                <span className="capitalize text-text-dimmed">
                  {selectedTemplate.category} · v{selectedTemplate.catalogVersion}
                </span>
                <span className="font-mono text-text-dimmed">{selectedTemplate.operation}</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-text-bright">
                {selectedTemplate.description}
              </div>
              <div className="mt-1 text-xxs leading-4 text-text-dimmed">
                {selectedTemplate.capabilities
                  .map((capability) => CAPABILITY_LABELS[capability])
                  .join(" · ")}
              </div>
            </div>
          ) : null}

          <Button
            data-testid="flowcordia-add-catalog-node"
            className="lg:mt-5"
            variant="secondary/small"
            disabled={disabled || !availableTemplateId}
            isLoading={busy}
            onClick={onAdd}
          >
            Add node
          </Button>
        </div>
      )}
    </div>
  );
}
