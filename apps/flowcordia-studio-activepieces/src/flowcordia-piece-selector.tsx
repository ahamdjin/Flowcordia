import {
  FlowActionType,
  FlowOperationType,
  PackageType,
  PieceType,
  type FlowTriggerType,
} from "@activepieces/shared";
import { Code2, GitBranch, Globe2, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useBuilderStateContext } from "@/app/builder/builder-hooks";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  PieceSelectorItem,
  PieceSelectorOperation,
} from "@/features/pieces";

interface PieceSelectorProps {
  children: ReactNode;
  id: string;
  operation: PieceSelectorOperation;
  openSelectorOnClick?: boolean;
  stepToReplacePieceDisplayName?: string;
}

interface FlowcordiaNodeOption {
  key: string;
  title: string;
  description: string;
  icon: ReactNode;
  item: PieceSelectorItem;
}

const sourceItem = {
  type: FlowActionType.CODE,
  displayName: "Source",
  logoUrl: "",
  description: "Run isolated TypeScript with Flowcordia input, steps, variables and credentials.",
} as PieceSelectorItem;

const conditionItem = {
  type: FlowActionType.ROUTER,
  displayName: "Condition",
  logoUrl: "",
  description: "Split the workflow into true and false branches.",
} as PieceSelectorItem;

const httpItem = {
  type: FlowActionType.PIECE,
  actionOrTrigger: {
    name: "send_request",
    displayName: "HTTP Request",
    description: "Send an HTTP request through Flowcordia's governed HTTP operation.",
    requireAuth: false,
    props: {},
    run: async () => ({})
  },
  pieceMetadata: {
    type: FlowActionType.PIECE,
    displayName: "HTTP",
    logoUrl: "https://cdn.activepieces.com/pieces/new-core/http.svg",
    description: "Send an HTTP request.",
    pieceName: "@activepieces/piece-http",
    pieceVersion: "0.11.13",
    categories: ["CORE"],
    packageType: PackageType.REGISTRY,
    pieceType: PieceType.OFFICIAL,
    auth: undefined,
    suggestedActions: {},
    suggestedTriggers: {}
  }
} as PieceSelectorItem;

function availableOptions(operation: PieceSelectorOperation): FlowcordiaNodeOption[] {
  if (operation.type === FlowOperationType.UPDATE_TRIGGER) return [];
  return [
    {
      key: "source",
      title: "Source",
      description: "TypeScript code node",
      icon: <Code2 className="size-4" />,
      item: sourceItem,
    },
    {
      key: "http",
      title: "HTTP Request",
      description: "Call an external API",
      icon: <Globe2 className="size-4" />,
      item: httpItem,
    },
    {
      key: "condition",
      title: "Condition",
      description: "Create true and false branches",
      icon: <GitBranch className="size-4" />,
      item: conditionItem,
    },
  ];
}

export function PieceSelector({
  children,
  id,
  operation,
  openSelectorOnClick = true,
}: PieceSelectorProps) {
  const [query, setQuery] = useState("");
  const [openedId, setOpenedId, handleAddingOrUpdatingStep, readonly] =
    useBuilderStateContext((state) => [
      state.openedPieceSelectorStepNameOrAddButtonId,
      state.setOpenedPieceSelectorStepNameOrAddButtonId,
      state.handleAddingOrUpdatingStep,
      state.readonly,
    ]);
  const open = openedId === id;
  const options = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return availableOptions(operation).filter((option) =>
      normalized
        ? `${option.title} ${option.description}`.toLowerCase().includes(normalized)
        : true
    );
  }, [operation, query]);

  const close = () => {
    setQuery("");
    setOpenedId(null);
  };

  return (
    <Popover
      open={open}
      modal={false}
      onOpenChange={(nextOpen) => {
        if (readonly) return;
        if (nextOpen) setOpenedId(id);
        else close();
      }}
    >
      <PopoverTrigger
        asChild
        onClick={() => {
          if (!readonly && openSelectorOnClick) setOpenedId(id);
        }}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-[360px] overflow-hidden p-0 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">
            Flowcordia nodes
          </div>
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search nodes"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {operation.type === FlowOperationType.UPDATE_TRIGGER ? (
            <div className="rounded-md px-3 py-4 text-sm text-muted-foreground">
              The Manual Trigger is managed by Flowcordia for this Studio release.
            </div>
          ) : options.length === 0 ? (
            <div className="rounded-md px-3 py-4 text-sm text-muted-foreground">
              No matching nodes.
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.key}
                type="button"
                className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-accent"
                onClick={() => {
                  handleAddingOrUpdatingStep({
                    pieceSelectorItem: option.item,
                    operation,
                    selectStepAfter: true,
                  });
                  close();
                }}
              >
                <span className="mt-0.5 flex size-8 items-center justify-center rounded-md border border-border bg-background">
                  {option.icon}
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm font-medium">{option.title}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type { FlowTriggerType };
