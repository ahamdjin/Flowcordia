from pathlib import Path


def patch(path_text: str, replacements: list[tuple[str, str, str]]) -> None:
    path = Path(path_text)
    text = path.read_text()
    for old, new, label in replacements:
        if new in text:
            continue
        count = text.count(old)
        if count != 1:
            raise RuntimeError(f"{path_text}: {label}: expected one marker, found {count}")
        text = text.replace(old, new, 1)
    path.write_text(text)


patch(
    "packages/flowcordia-workflow/src/editor.ts",
    [
        (
            '  | { type: "duplicate_subgraph"; nodeIds: string[]; offset: WorkflowEditPosition }\n  | { type: "rename_node";',
            '  | { type: "duplicate_subgraph"; nodeIds: string[]; offset: WorkflowEditPosition }\n  | { type: "remove_nodes"; nodeIds: string[] }\n  | { type: "rename_node";',
            "portable remove-nodes command type",
        ),
        (
            '''      workflow.edges.push(...duplicatedEdges);
      return finish(workflow);
    }
    case "rename_node": {''',
            '''      workflow.edges.push(...duplicatedEdges);
      return finish(workflow);
    }
    case "remove_nodes": {
      const selectedIds = new Set(command.nodeIds);
      if (selectedIds.size !== command.nodeIds.length) {
        return failure("invalid_result", "Node IDs must be unique.");
      }
      const missingNodeId = command.nodeIds.find(
        (nodeId) => !workflow.nodes.some((node) => node.id === nodeId)
      );
      if (missingNodeId) {
        return failure("node_not_found", `Node "${missingNodeId}" does not exist.`);
      }
      workflow.nodes = workflow.nodes.filter((node) => !selectedIds.has(node.id));
      workflow.edges = workflow.edges.filter(
        (edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)
      );
      return finish(workflow);
    }
    case "rename_node": {''',
            "portable atomic removal implementation",
        ),
    ],
)

patch(
    "apps/webapp/app/features/flowcordia/workflows/drafts/commands.server.ts",
    [
        (
            '''  WorkflowDuplicateSubgraphCommand,
  WorkflowMoveNodesCommand,
} from "./selection-command-contract";''',
            '''  WorkflowDuplicateSubgraphCommand,
  WorkflowMoveNodesCommand,
  WorkflowRemoveNodesCommand,
} from "./selection-command-contract";''',
            "remove-nodes command import",
        ),
        (
            '''  WorkflowMoveNodesCommand,
  WorkflowDuplicateSubgraphCommand,
  z''',
            '''  WorkflowMoveNodesCommand,
  WorkflowDuplicateSubgraphCommand,
  WorkflowRemoveNodesCommand,
  z''',
            "strict route union",
        ),
    ],
)

patch(
    "apps/webapp/app/features/flowcordia/workflows/drafts/types.ts",
    [
        (
            '''    case "duplicate_subgraph":
      return {
        command: command.type,
        nodeIds: command.nodeIds,
        offset: command.offset,
      };
    case "rename_node":''',
            '''    case "duplicate_subgraph":
      return {
        command: command.type,
        nodeIds: command.nodeIds,
        offset: command.offset,
      };
    case "remove_nodes":
      return {
        command: command.type,
        nodeIds: command.nodeIds,
        nodeCount: command.nodeIds.length,
      };
    case "rename_node":''',
            "safe removal audit summary",
        ),
    ],
)

patch(
    "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx",
    [
        (
            'import { PlusIcon } from "lucide-react";',
            'import { PlusIcon, Trash2Icon } from "lucide-react";',
            "trash icon import",
        ),
        (
            'import { useCallback, useEffect, useMemo, useRef, useState } from "react";\nimport { cn } from "~/utils/cn";',
            '''import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/primitives/Dialog";
import { cn } from "~/utils/cn";''',
            "confirmation primitives",
        ),
        (
            '''  buildWorkflowStudioDuplicateCommand,
  buildWorkflowStudioMoveNodesCommand,
  createWorkflowStudioNodeClipboardPayload,''',
            '''  buildWorkflowStudioDuplicateCommand,
  buildWorkflowStudioMoveNodesCommand,
  createWorkflowStudioNodeClipboardPayload,
  createWorkflowStudioNodeRemovalPlan,''',
            "removal plan import",
        ),
        (
            '''  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(''',
            '''  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    nodeIds: string[];
    edgeCount: number;
  } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(''',
            "pending removal state",
        ),
        (
            '''  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTextEntryElement(event.target) || !editable) return;''',
            '''  const requestNodeRemoval = () => {
    if (!editable) return;
    const plan = createWorkflowStudioNodeRemovalPlan({
      nodeIds: selectedNodeIdsInGraphOrder(),
      edges: graph.edges,
    });
    if (!plan) return;
    setPendingRemoval({ nodeIds: plan.command.nodeIds, edgeCount: plan.edgeCount });
    setAnnouncement(
      `Confirm removal of ${plan.command.nodeIds.length} selected node${
        plan.command.nodeIds.length === 1 ? "" : "s"
      } and ${plan.edgeCount} connected edge${plan.edgeCount === 1 ? "" : "s"}.`
    );
  };

  const submitNodeRemoval = () => {
    if (!pendingRemoval || !editable) return;
    onCommand({ type: "remove_nodes", nodeIds: pendingRemoval.nodeIds });
    setPendingRemoval(null);
    setAnnouncement(
      `${pendingRemoval.nodeIds.length} selected node${
        pendingRemoval.nodeIds.length === 1 ? "" : "s"
      } submitted for removal through the workflow draft.`
    );
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTextEntryElement(event.target) || !editable) return;''',
            "node removal handlers",
        ),
        (
            '''    if (selectedNodeIdsRef.current.size > 0) {
      event.preventDefault();
      event.stopPropagation();
      setAnnouncement("Remove selected nodes individually from the inspector.");
    }''',
            '''    if (selectedNodeIdsRef.current.size > 0) {
      event.preventDefault();
      event.stopPropagation();
      requestNodeRemoval();
    }''',
            "keyboard deletion confirmation",
        ),
        (
            '''        selected editable node, and hold Shift for a larger step. Drag empty space to select a
        group, or hold Control or Command while selecting nodes. Use Control or Command with C and V
        to copy and paste selected nodes by identity, or D to duplicate them. Drag a source handle
        to an eligible target handle to connect nodes. Drag the target end of a selected connection
        to reconnect it. Press Delete or Backspace to remove the selected writable connection.
        Remove nodes from the inspector. Double-click empty canvas space, use the Add node button,''',
            '''        selected editable node, and hold Shift for a larger step. Drag empty space to select a
        group, or hold Control or Command while selecting nodes. Use Control or Command with C and V
        to copy and paste selected nodes by identity, or D to duplicate them. Drag a source handle
        to an eligible target handle to connect nodes. Drag the target end of a selected connection
        to reconnect it. Press Delete or Backspace to confirm removal of the selected connection or
        nodes. Double-click empty canvas space, use the Add node button,''',
            "accessible deletion instructions",
        ),
        (
            '''              {selectedNodeIds.size > 0 && (
                <button
                  type="button"
                  data-testid="flowcordia-duplicate-selection"
                  className="nodrag nopan h-9 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 focus-custom"
                  onClick={() =>
                    submitDuplicate(selectedNodeIdsInGraphOrder(), nextDuplicateOffset())
                  }
                >
                  Duplicate {selectedNodeIds.size === 1 ? "node" : `${selectedNodeIds.size} nodes`}
                </button>
              )}''',
            '''              {selectedNodeIds.size > 0 && (
                <>
                  <button
                    type="button"
                    data-testid="flowcordia-duplicate-selection"
                    className="nodrag nopan h-9 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 focus-custom"
                    onClick={() =>
                      submitDuplicate(selectedNodeIdsInGraphOrder(), nextDuplicateOffset())
                    }
                  >
                    Duplicate {selectedNodeIds.size === 1 ? "node" : `${selectedNodeIds.size} nodes`}
                  </button>
                  <button
                    type="button"
                    data-testid="flowcordia-remove-selection"
                    className="nodrag nopan flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white/95 px-3 text-xs font-medium text-rose-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-rose-300 hover:bg-rose-50 focus-custom"
                    onClick={requestNodeRemoval}
                  >
                    <Trash2Icon className="size-3.5" aria-hidden="true" />
                    Remove {selectedNodeIds.size === 1 ? "node" : `${selectedNodeIds.size} nodes`}
                  </button>
                </>
              )}''',
            "visible remove selection action",
        ),
        (
            '''      {quickCreate && (
        <div
          className="absolute z-50"
          style={{ left: quickCreate.anchor.left, top: quickCreate.anchor.top }}
        >
          <WorkflowStudioQuickNodeCreator
            context={quickCreate.context as WorkflowStudioQuickCreateContext}
            disabled={!editable}
            onChoose={handleQuickChoose}
            onClose={() => setQuickCreate(null)}
          />
        </div>
      )}
    </div>''',
            '''      {quickCreate && (
        <div
          className="absolute z-50"
          style={{ left: quickCreate.anchor.left, top: quickCreate.anchor.top }}
        >
          <WorkflowStudioQuickNodeCreator
            context={quickCreate.context as WorkflowStudioQuickCreateContext}
            disabled={!editable}
            onChoose={handleQuickChoose}
            onClose={() => setQuickCreate(null)}
          />
        </div>
      )}
      <Dialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Remove {pendingRemoval?.nodeIds.length ?? 0} selected node
              {(pendingRemoval?.nodeIds.length ?? 0) === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This removes {pendingRemoval?.nodeIds.length ?? 0} node
              {(pendingRemoval?.nodeIds.length ?? 0) === 1 ? "" : "s"} and {" "}
              {pendingRemoval?.edgeCount ?? 0} connected edge
              {(pendingRemoval?.edgeCount ?? 0) === 1 ? "" : "s"} from the current draft. The
              server will reject the operation if the resulting workflow is invalid. The accepted
              edit can be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary/small" onClick={() => setPendingRemoval(null)}>
              Cancel
            </Button>
            <Button
              data-testid="flowcordia-confirm-remove-selection"
              variant="danger/small"
              onClick={submitNodeRemoval}
            >
              Remove nodes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>''',
            "accessible destructive confirmation",
        ),
    ],
)

patch(
    "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.react-flow-contract.test.ts",
    [
        (
            '''    expect(source).toContain("buildWorkflowStudioReactFlowConnectionCommand");
  });''',
            '''    expect(source).toContain("buildWorkflowStudioReactFlowConnectionCommand");
  });

  it("routes multi-node deletion through one accessible canonical command", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./WorkflowStudioCanvas.tsx", import.meta.url)),
      "utf8"
    );

    expect(source).toContain("createWorkflowStudioNodeRemovalPlan");
    expect(source).toContain('type: "remove_nodes"');
    expect(source).toContain("flowcordia-remove-selection");
    expect(source).toContain("flowcordia-confirm-remove-selection");
    expect(source).toContain("server will reject the operation if the resulting workflow is invalid");
    expect(source).toContain("The accepted edit can be undone");
    expect(source).not.toContain("Remove selected nodes individually from the inspector");
  });''',
            "permanent deletion integration contract",
        ),
    ],
)
