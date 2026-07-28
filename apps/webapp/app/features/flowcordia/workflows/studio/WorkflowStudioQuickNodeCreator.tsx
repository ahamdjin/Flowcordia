import {
  type WorkflowStudioNodeCatalogCategory,
  type WorkflowStudioNodeTemplate,
  type WorkflowStudioTemplateId,
} from "@flowcordia/workflow";
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "~/utils/cn";
import {
  rememberWorkflowStudioQuickTemplate,
  workflowStudioQuickNodeTemplates,
  type WorkflowStudioQuickCreateCategory,
  type WorkflowStudioQuickCreateContext,
} from "./quick-node-creator";

const RECENT_STORAGE_KEY = "flowcordia.studio.recent-node-templates";

const categories: readonly {
  id: WorkflowStudioQuickCreateCategory;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "trigger", label: "Triggers" },
  { id: "action", label: "Actions" },
  { id: "logic", label: "Logic & flow" },
  { id: "output", label: "Output" },
];

function headingForContext(context: WorkflowStudioQuickCreateContext): string {
  switch (context) {
    case "standalone":
      return "Add a node";
    case "after_source":
      return "Choose the next step";
    case "on_edge":
      return "Insert a step";
  }
}

function templateTone(category: WorkflowStudioNodeCatalogCategory): string {
  switch (category) {
    case "trigger":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "action":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "logic":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "output":
      return "border-pink-200 bg-pink-50 text-pink-700";
  }
}

function readRecentTemplates(): WorkflowStudioTemplateId[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? (value.filter((entry) => typeof entry === "string") as WorkflowStudioTemplateId[])
      : [];
  } catch {
    return [];
  }
}

export function WorkflowStudioQuickNodeCreator({
  context,
  disabled,
  onChoose,
  onClose,
}: {
  context: WorkflowStudioQuickCreateContext;
  disabled: boolean;
  onChoose: (templateId: WorkflowStudioTemplateId) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WorkflowStudioQuickCreateCategory>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<WorkflowStudioTemplateId[]>([]);
  const results = useMemo(() => {
    const available = workflowStudioQuickNodeTemplates({ context, query, category });
    if (query.trim() || category !== "all" || recent.length === 0) return available;
    const rank = new Map(recent.map((templateId, index) => [templateId, index]));
    return [...available].sort((left, right) => {
      const leftRank = rank.get(left.id) ?? Number.POSITIVE_INFINITY;
      const rightRank = rank.get(right.id) ?? Number.POSITIVE_INFINITY;
      return leftRank - rightRank;
    });
  }, [category, context, query, recent]);

  useEffect(() => {
    setRecent(readRecentTemplates());
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  const choose = (template: WorkflowStudioNodeTemplate) => {
    if (disabled) return;
    const nextRecent = rememberWorkflowStudioQuickTemplate(recent, template.id);
    setRecent(nextRecent);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(nextRecent));
    }
    onChoose(template.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(results.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  };

  return (
    <div
      data-testid="flowcordia-quick-node-creator"
      role="dialog"
      aria-modal="false"
      aria-label={headingForContext(context)}
      className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-black/10 bg-white text-zinc-800 shadow-[0_20px_70px_rgba(24,24,27,0.24)]"
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2.5">
        <SearchIcon className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
        <input
          ref={inputRef}
          data-testid="flowcordia-quick-node-search"
          type="search"
          value={query}
          disabled={disabled}
          placeholder="Search nodes"
          aria-label="Search workflow nodes"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
        />
        <button
          type="button"
          aria-label="Close node creator"
          className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-custom"
          onClick={onClose}
        >
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="border-b border-black/10 px-3 py-2">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
          {headingForContext(context)}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {categories.map((entry) => (
            <button
              key={entry.id}
              type="button"
              disabled={disabled}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium transition focus-custom",
                category === entry.id
                  ? "border-zinc-800 bg-zinc-800 text-white"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
              )}
              onClick={() => {
                setCategory(entry.id);
                setActiveIndex(0);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div
        role="listbox"
        aria-label="Available workflow nodes"
        className="max-h-80 overflow-y-auto p-2"
      >
        {results.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs leading-5 text-zinc-500">
            No node matches this search.
          </div>
        ) : (
          results.map((template, index) => (
            <button
              key={template.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              disabled={disabled}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition focus-custom",
                index === activeIndex ? "border-zinc-200 bg-zinc-100" : "hover:bg-zinc-50"
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(template)}
            >
              <span
                className={cn(
                  "mt-0.5 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]",
                  templateTone(template.category)
                )}
              >
                {template.category}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-xs font-semibold text-zinc-800">
                    {template.label}
                  </span>
                  {template.releaseStage === "limited" && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                      Limited
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-zinc-500">
                  {template.description}
                </span>
                <span className="mt-1 block font-mono text-[9px] text-zinc-400">
                  {template.operation}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-black/10 bg-zinc-50 px-3 py-2 text-[9px] text-zinc-400">
        <span>↑↓ navigate · Enter add</span>
        <span>Esc close</span>
      </div>
    </div>
  );
}
