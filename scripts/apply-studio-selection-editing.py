from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one marker in {path}, found {count}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


def replace_count(path: str, old: str, new: str, expected: int) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"Expected {expected} markers in {path}, found {count}: {old[:80]!r}")
    file.write_text(text.replace(old, new))


editor = "packages/flowcordia-workflow/src/editor.ts"
replace_once(
    editor,
    'type WorkflowEditPosition = WorkflowPosition & JsonObject;\n',
    'type WorkflowEditPosition = WorkflowPosition & JsonObject;\n'
    'type WorkflowEditMove = { nodeId: string; position: WorkflowEditPosition } & JsonObject;\n',
)
replace_once(
    editor,
    '  | { type: "move_node"; nodeId: string; position: WorkflowEditPosition }\n',
    '  | { type: "move_node"; nodeId: string; position: WorkflowEditPosition }\n'
    '  | { type: "move_nodes"; moves: WorkflowEditMove[] }\n'
    '  | { type: "duplicate_subgraph"; nodeIds: string[]; offset: WorkflowEditPosition }\n',
)
replace_once(
    editor,
    '''    case "move_node": {\n      const node = workflow.nodes.find((candidate) => candidate.id === command.nodeId);\n      if (!node) return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);\n      node.position = { ...command.position };\n      return finish(workflow);\n    }\n''',
    '''    case "move_node": {\n      const node = workflow.nodes.find((candidate) => candidate.id === command.nodeId);\n      if (!node) return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);\n      node.position = { ...command.position };\n      return finish(workflow);\n    }\n    case "move_nodes": {\n      const moveIds = command.moves.map((move) => move.nodeId);\n      if (new Set(moveIds).size !== moveIds.length) {\n        return failure("invalid_result", "Each node can move only once per command.");\n      }\n      const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));\n      for (const move of command.moves) {\n        if (!nodesById.has(move.nodeId)) {\n          return failure("node_not_found", `Node "${move.nodeId}" does not exist.`);\n        }\n      }\n      for (const move of command.moves) {\n        nodesById.get(move.nodeId)!.position = { ...move.position };\n      }\n      return finish(workflow);\n    }\n    case "duplicate_subgraph": {\n      const selectedIds = new Set(command.nodeIds);\n      if (selectedIds.size !== command.nodeIds.length) {\n        return failure("invalid_result", "Node IDs must be unique.");\n      }\n      const originals = workflow.nodes.filter((node) => selectedIds.has(node.id));\n      if (originals.length !== selectedIds.size) {\n        const missingNodeId = command.nodeIds.find(\n          (nodeId) => !workflow.nodes.some((node) => node.id === nodeId)\n        );\n        return failure("node_not_found", `Node "${missingNodeId ?? "unknown"}" does not exist.`);\n      }\n\n      const usedNodeIds = new Set(workflow.nodes.map((node) => node.id));\n      const duplicatedNodeIds = new Map<string, string>();\n      const duplicates = originals.map((node) => {\n        const id = nextId(`${node.id}_copy`, usedNodeIds);\n        usedNodeIds.add(id);\n        duplicatedNodeIds.set(node.id, id);\n        const duplicate = JSON.parse(JSON.stringify(node)) as WorkflowNode;\n        duplicate.id = id;\n        duplicate.position = {\n          x: node.position.x + command.offset.x,\n          y: node.position.y + command.offset.y,\n        };\n        if (duplicate.name) duplicate.name = `${duplicate.name} copy`.slice(0, 160);\n        return duplicate;\n      });\n      workflow.nodes.push(...duplicates);\n\n      const usedEdgeIds = new Set(workflow.edges.map((edge) => edge.id));\n      const duplicatedEdges = workflow.edges\n        .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))\n        .map((edge) => {\n          const duplicate = JSON.parse(JSON.stringify(edge)) as (typeof workflow.edges)[number];\n          duplicate.id = nextId(`${edge.id}_copy`, usedEdgeIds);\n          usedEdgeIds.add(duplicate.id);\n          duplicate.source = duplicatedNodeIds.get(edge.source)!;\n          duplicate.target = duplicatedNodeIds.get(edge.target)!;\n          return duplicate;\n        });\n      workflow.edges.push(...duplicatedEdges);\n      return finish(workflow);\n    }\n''',
)

commands = "apps/webapp/app/features/flowcordia/workflows/drafts/commands.server.ts"
replace_once(
    commands,
    '''import {\n  WorkflowAddConnectedNodeCommand,\n  WorkflowInsertNodeOnEdgeCommand,\n} from "./fast-create-command-contract";\n''',
    '''import {\n  WorkflowAddConnectedNodeCommand,\n  WorkflowInsertNodeOnEdgeCommand,\n} from "./fast-create-command-contract";\nimport {\n  WorkflowDuplicateSubgraphCommand,\n  WorkflowMoveNodesCommand,\n} from "./selection-command-contract";\n''',
)
replace_once(
    commands,
    '''  WorkflowAddConnectedNodeCommand,\n  WorkflowInsertNodeOnEdgeCommand,\n''',
    '''  WorkflowAddConnectedNodeCommand,\n  WorkflowInsertNodeOnEdgeCommand,\n  WorkflowMoveNodesCommand,\n  WorkflowDuplicateSubgraphCommand,\n''',
)

draft_types = "apps/webapp/app/features/flowcordia/workflows/drafts/types.ts"
replace_once(
    draft_types,
    '''    case "move_node":\n      return { command: command.type, nodeId: command.nodeId };\n''',
    '''    case "move_node":\n      return { command: command.type, nodeId: command.nodeId };\n    case "move_nodes":\n      return {\n        command: command.type,\n        nodeIds: command.moves.map((move) => move.nodeId),\n      };\n    case "duplicate_subgraph":\n      return {\n        command: command.type,\n        nodeIds: command.nodeIds,\n        offset: command.offset,\n      };\n''',
)

canvas = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx"
replace_once(
    canvas,
    'import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";\n',
    'import type {\n'
    '  ClipboardEvent as ReactClipboardEvent,\n'
    '  KeyboardEvent as ReactKeyboardEvent,\n'
    '  MouseEvent as ReactMouseEvent,\n'
    '} from "react";\n',
)
replace_once(
    canvas,
    '''import {\n  buildWorkflowStudioReactFlowConnectionCommand,\n  buildWorkflowStudioReactFlowReconnectCommand,\n} from "./canvas-react-flow";\n''',
    '''import {\n  buildWorkflowStudioReactFlowConnectionCommand,\n  buildWorkflowStudioReactFlowReconnectCommand,\n} from "./canvas-react-flow";\nimport {\n  FLOWCORDIA_NODE_CLIPBOARD_TYPE,\n  buildWorkflowStudioDuplicateCommand,\n  buildWorkflowStudioMoveNodesCommand,\n  createWorkflowStudioNodeClipboardPayload,\n  parseWorkflowStudioNodeClipboardPayload,\n  serializeWorkflowStudioNodeClipboardPayload,\n} from "./canvas-selection";\n''',
)
replace_once(
    canvas,
    'const MAX_ZOOM = 2;\n',
    '''const MAX_ZOOM = 2;\n\nfunction sameNodeSelection(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {\n  return left.size === right.size && [...left].every((nodeId) => right.has(nodeId));\n}\n''',
)
replace_once(
    canvas,
    '''  selectedNodeId,\n  editable,\n''',
    '''  selectedNodeIds,\n  editable,\n''',
)
replace_once(
    canvas,
    '''  selectedNodeId: string | null;\n  editable: boolean;\n''',
    '''  selectedNodeIds: ReadonlySet<string>;\n  editable: boolean;\n''',
)
replace_once(
    canvas,
    '      selected: selectedNodeId === node.id,\n',
    '      selected: selectedNodeIds.has(node.id),\n',
)
replace_once(
    canvas,
    '''  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);\n  const pointerDraggingNodeIds = useRef(new Set<string>());\n''',
    '''  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);\n  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(\n    () => new Set(selectedNodeId ? [selectedNodeId] : [])\n  );\n  const selectedNodeIdsRef = useRef<ReadonlySet<string>>(selectedNodeIds);\n  const pointerDraggingNodeIds = useRef(new Set<string>());\n  const pasteOffsetStep = useRef(0);\n''',
)
replace_once(
    canvas,
    '''        liveNodesById,\n        selectedNodeId,\n        editable,\n''',
    '''        liveNodesById,\n        selectedNodeIds,\n        editable,\n''',
)
replace_once(
    canvas,
    '    [editable, graph, liveNodesById, openQuickCreate, selectedNodeId]\n',
    '    [editable, graph, liveNodesById, openQuickCreate, selectedNodeIds]\n',
)
replace_once(
    canvas,
    '''  const [nodes, setNodes, applyNodeChanges] = useNodesState<CanvasNode>(initialNodes);\n  const [edges, setEdges, applyEdgeChanges] = useEdgesState<CanvasEdge>(initialEdges);\n\n  useEffect(() => {\n''',
    '''  const [nodes, setNodes, applyNodeChanges] = useNodesState<CanvasNode>(initialNodes);\n  const [edges, setEdges, applyEdgeChanges] = useEdgesState<CanvasEdge>(initialEdges);\n\n  useEffect(() => {\n    selectedNodeIdsRef.current = selectedNodeIds;\n  }, [selectedNodeIds]);\n\n  useEffect(() => {\n    if (!selectedNodeId || selectedNodeIdsRef.current.has(selectedNodeId)) return;\n    setSelectedNodeIds(new Set([selectedNodeId]));\n  }, [selectedNodeId]);\n\n  useEffect(() => {\n    const availableNodeIds = new Set(graph.nodes.map((node) => node.id));\n    setSelectedNodeIds((current) => {\n      const next = new Set([...current].filter((nodeId) => availableNodeIds.has(nodeId)));\n      return sameNodeSelection(current, next) ? current : next;\n    });\n  }, [graph.nodes]);\n\n  useEffect(() => {\n''',
)
replace_once(
    canvas,
    '''  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {\n    if (isTextEntryElement(event.target) || !editable) return;\n    if (event.key !== "Delete" && event.key !== "Backspace") return;\n    if (selectedEdgeId) {\n      event.preventDefault();\n      event.stopPropagation();\n      const label = workflowStudioCanvasEdgeLabel(graph, selectedEdgeId);\n      onSelectEdge(null);\n      onRemoveEdge(selectedEdgeId);\n      setAnnouncement(`${label} removed.`);\n      return;\n    }\n    if (selectedNodeId) {\n      event.preventDefault();\n      event.stopPropagation();\n      setAnnouncement("Remove the selected node from its inspector.");\n    }\n  };\n''',
    '''  const selectedNodeIdsInGraphOrder = () =>\n    graph.nodes.filter((node) => selectedNodeIdsRef.current.has(node.id)).map((node) => node.id);\n\n  const submitDuplicate = (nodeIds: readonly string[], offset: { x: number; y: number }) => {\n    if (!editable) return;\n    const command = buildWorkflowStudioDuplicateCommand({ nodeIds, offset });\n    if (!command) return;\n    onCommand(command);\n    setAnnouncement(\n      `${command.nodeIds.length} selected node${command.nodeIds.length === 1 ? "" : "s"} submitted for duplication.`\n    );\n  };\n\n  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {\n    if (isTextEntryElement(event.target)) return;\n    const payload = createWorkflowStudioNodeClipboardPayload({\n      workflowId: graph.workflowId,\n      nodeIds: selectedNodeIdsInGraphOrder(),\n    });\n    if (!payload) return;\n    event.clipboardData.setData(\n      FLOWCORDIA_NODE_CLIPBOARD_TYPE,\n      serializeWorkflowStudioNodeClipboardPayload(payload)\n    );\n    event.clipboardData.setData(\n      "text/plain",\n      `Flowcordia nodes from ${payload.workflowId}: ${payload.nodeIds.join(", ")}`\n    );\n    event.preventDefault();\n    setAnnouncement(\n      `${payload.nodeIds.length} node${payload.nodeIds.length === 1 ? "" : "s"} copied by identity.`\n    );\n  };\n\n  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {\n    if (isTextEntryElement(event.target) || !editable) return;\n    const payload = parseWorkflowStudioNodeClipboardPayload(\n      event.clipboardData.getData(FLOWCORDIA_NODE_CLIPBOARD_TYPE)\n    );\n    if (!payload) return;\n    event.preventDefault();\n    if (payload.workflowId !== graph.workflowId) {\n      setAnnouncement("Copied nodes can be pasted only into the workflow they came from.");\n      return;\n    }\n    pasteOffsetStep.current = (pasteOffsetStep.current % 5) + 1;\n    const distance = pasteOffsetStep.current * GRID_SIZE * 2;\n    submitDuplicate(payload.nodeIds, { x: distance, y: distance });\n  };\n\n  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {\n    if (isTextEntryElement(event.target) || !editable) return;\n    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {\n      const nodeIds = selectedNodeIdsInGraphOrder();\n      if (nodeIds.length === 0) return;\n      event.preventDefault();\n      event.stopPropagation();\n      submitDuplicate(nodeIds, { x: GRID_SIZE * 2, y: GRID_SIZE * 2 });\n      return;\n    }\n    if (event.key !== "Delete" && event.key !== "Backspace") return;\n    if (selectedEdgeId) {\n      event.preventDefault();\n      event.stopPropagation();\n      const label = workflowStudioCanvasEdgeLabel(graph, selectedEdgeId);\n      onSelectEdge(null);\n      onRemoveEdge(selectedEdgeId);\n      setAnnouncement(`${label} removed.`);\n      return;\n    }\n    if (selectedNodeIdsRef.current.size > 0) {\n      event.preventDefault();\n      event.stopPropagation();\n      setAnnouncement("Remove selected nodes individually from the inspector.");\n    }\n  };\n''',
)
replace_once(
    canvas,
    '''      role="region"\n      aria-label={`Workflow canvas for ${graph.name}`}\n''',
    '''      role="region"\n      tabIndex={0}\n      aria-label={`Workflow canvas for ${graph.name}`}\n''',
)
replace_once(
    canvas,
    '''      onDoubleClick={handleCanvasDoubleClick}\n      onKeyDownCapture={handleKeyDown}\n''',
    '''      onCopy={handleCopy}\n      onPaste={handlePaste}\n      onDoubleClick={handleCanvasDoubleClick}\n      onKeyDownCapture={handleKeyDown}\n''',
)
replace_once(
    canvas,
    '''        selected editable node, and hold Shift for a larger step. Drag a source handle to an\n        eligible target handle to connect nodes. Drag the target end of a selected connection to\n''',
    '''        selected editable node, and hold Shift for a larger step. Drag empty space to select a\n        group, or hold Control or Command while selecting nodes. Use Control or Command with C and V\n        to copy and paste selected nodes by identity, or D to duplicate them. Drag a source handle to\n        an eligible target handle to connect nodes. Drag the target end of a selected connection to\n''',
)
replace_once(
    canvas,
    '''        elementsSelectable\n        deleteKeyCode={null}\n        selectionOnDrag\n''',
    '''        elementsSelectable\n        deleteKeyCode={null}\n        multiSelectionKeyCode={["Meta", "Control"]}\n        selectionOnDrag\n''',
)
replace_once(
    canvas,
    '''        onNodeClick={(_event, node) => {\n          onSelectEdge(null);\n          onSelectNode(node.id);\n        }}\n        onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}\n''',
    '''        onNodeClick={(_event, node) => {\n          onSelectEdge(null);\n          onSelectNode(node.id);\n        }}\n        onEdgeClick={(_event, edge) => {\n          setSelectedNodeIds(new Set());\n          onSelectEdge(edge.id);\n        }}\n''',
)
replace_once(
    canvas,
    '''        onPaneClick={() => {\n          onSelectEdge(null);\n          setQuickCreate(null);\n        }}\n        onNodeDragStart={(_event, node) => pointerDraggingNodeIds.current.add(node.id)}\n        onNodeDragStop={(_event, node) => {\n          pointerDraggingNodeIds.current.delete(node.id);\n          setNodes((current) =>\n            current.map((candidate) =>\n              candidate.id === node.id\n                ? {\n                    ...candidate,\n                    position: { x: snap(node.position.x), y: snap(node.position.y) },\n                  }\n                : candidate\n            )\n          );\n          commitPosition(node.id, node.position);\n        }}\n''',
    '''        onPaneClick={() => {\n          setSelectedNodeIds(new Set());\n          onSelectEdge(null);\n          setQuickCreate(null);\n        }}\n        onNodeDragStart={(_event, node) => {\n          const selected = new Set(\n            (instanceRef.current?.getNodes() ?? [])\n              .filter((candidate) => candidate.selected)\n              .map((candidate) => candidate.id)\n          );\n          selected.add(node.id);\n          pointerDraggingNodeIds.current = selected;\n        }}\n        onNodeDragStop={() => {\n          const draggedNodeIds = pointerDraggingNodeIds.current;\n          pointerDraggingNodeIds.current = new Set();\n          const moves = (instanceRef.current?.getNodes() ?? [])\n            .filter((candidate) => draggedNodeIds.has(candidate.id))\n            .map((candidate) => ({\n              nodeId: candidate.id,\n              position: { x: snap(candidate.position.x), y: snap(candidate.position.y) },\n            }));\n          setNodes((current) =>\n            current.map((candidate) => {\n              const move = moves.find((entry) => entry.nodeId === candidate.id);\n              return move ? { ...candidate, position: move.position } : candidate;\n            })\n          );\n          if (moves.length === 1) {\n            commitPosition(moves[0]!.nodeId, moves[0]!.position);\n            return;\n          }\n          const command = buildWorkflowStudioMoveNodesCommand(moves);\n          if (!command) return;\n          for (const move of command.moves) {\n            committedPositions.current.set(\n              move.nodeId,\n              `${move.position.x}:${move.position.y}`\n            );\n          }\n          onCommand(command);\n          setAnnouncement(`${command.moves.length} selected nodes moved together.`);\n        }}\n''',
)
replace_once(
    canvas,
    '''        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {\n          const edge = selectedEdges.at(-1);\n          if (edge && edge.id !== selectedEdgeId) {\n            onSelectEdge(edge.id);\n            return;\n          }\n          const node = selectedNodes.at(-1);\n          if (node && node.id !== selectedNodeId) {\n            onSelectEdge(null);\n            onSelectNode(node.id);\n          }\n        }}\n''',
    '''        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {\n          const edge = selectedEdges.at(-1);\n          if (edge) {\n            setSelectedNodeIds(new Set());\n            if (edge.id !== selectedEdgeId) onSelectEdge(edge.id);\n            return;\n          }\n          const nextNodeIds = new Set(selectedNodes.map((node) => node.id));\n          setSelectedNodeIds((current) =>\n            sameNodeSelection(current, nextNodeIds) ? current : nextNodeIds\n          );\n          const node = selectedNodes.at(-1);\n          if (node && node.id !== selectedNodeId) {\n            onSelectEdge(null);\n            onSelectNode(node.id);\n          }\n        }}\n''',
)
replace_once(
    canvas,
    '''          <Panel position="top-left" className="!m-3">\n            <button\n              type="button"\n              data-testid="flowcordia-open-quick-node-creator"\n              className="nodrag nopan flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 focus-custom"\n              onClick={openAtViewportCenter}\n            >\n              <PlusIcon className="size-4 text-[#e95745]" aria-hidden="true" />\n              Add node\n            </button>\n          </Panel>\n''',
    '''          <Panel position="top-left" className="!m-3">\n            <div className="flex items-center gap-2">\n              <button\n                type="button"\n                data-testid="flowcordia-open-quick-node-creator"\n                className="nodrag nopan flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 focus-custom"\n                onClick={openAtViewportCenter}\n              >\n                <PlusIcon className="size-4 text-[#e95745]" aria-hidden="true" />\n                Add node\n              </button>\n              {selectedNodeIds.size > 0 && (\n                <button\n                  type="button"\n                  data-testid="flowcordia-duplicate-selection"\n                  className="nodrag nopan h-9 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 focus-custom"\n                  onClick={() =>\n                    submitDuplicate(selectedNodeIdsInGraphOrder(), {\n                      x: GRID_SIZE * 2,\n                      y: GRID_SIZE * 2,\n                    })\n                  }\n                >\n                  Duplicate {selectedNodeIds.size === 1 ? "node" : `${selectedNodeIds.size} nodes`}\n                </button>\n              )}\n            </div>\n          </Panel>\n''',
)

workflow = ".github/workflows/flowcordia-canvas-navigation.yml"
replace_count(
    workflow,
    '      - "apps/webapp/app/features/flowcordia/workflows/drafts/fast-create-command-contract.ts"\n',
    '      - "apps/webapp/app/features/flowcordia/workflows/drafts/fast-create-command-contract.ts"\n'
    '      - "apps/webapp/app/features/flowcordia/workflows/drafts/selection-command-contract.test.ts"\n'
    '      - "apps/webapp/app/features/flowcordia/workflows/drafts/selection-command-contract.ts"\n',
    2,
)
replace_count(
    workflow,
    '      - "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx"\n',
    '      - "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx"\n'
    '      - "apps/webapp/app/features/flowcordia/workflows/studio/canvas-selection.test.ts"\n'
    '      - "apps/webapp/app/features/flowcordia/workflows/studio/canvas-selection.ts"\n',
    2,
)
replace_count(
    workflow,
    '      - "packages/flowcordia-workflow/src/editor.fast-create.test.ts"\n',
    '      - "packages/flowcordia-workflow/src/editor.fast-create.test.ts"\n'
    '      - "packages/flowcordia-workflow/src/editor.selection.test.ts"\n',
    2,
)
replace_once(
    workflow,
    '''            test/edge-editing.test.ts \\\n            src/editor.fast-create.test.ts\n''',
    '''            test/edge-editing.test.ts \\\n            src/editor.fast-create.test.ts \\\n            src/editor.selection.test.ts\n''',
)
replace_once(
    workflow,
    '''            app/features/flowcordia/workflows/drafts/fast-create-command-contract.test.ts \\\n            app/features/flowcordia/workflows/studio/quick-node-creator.test.ts \\\n''',
    '''            app/features/flowcordia/workflows/drafts/fast-create-command-contract.test.ts \\\n            app/features/flowcordia/workflows/drafts/selection-command-contract.test.ts \\\n            app/features/flowcordia/workflows/studio/canvas-selection.test.ts \\\n            app/features/flowcordia/workflows/studio/quick-node-creator.test.ts \\\n''',
)
replace_once(
    workflow,
    '''            apps/webapp/app/features/flowcordia/workflows/drafts/fast-create-command-contract.ts \\\n            apps/webapp/app/features/flowcordia/workflows/drafts/types.ts \\\n''',
    '''            apps/webapp/app/features/flowcordia/workflows/drafts/fast-create-command-contract.ts \\\n            apps/webapp/app/features/flowcordia/workflows/drafts/selection-command-contract.test.ts \\\n            apps/webapp/app/features/flowcordia/workflows/drafts/selection-command-contract.ts \\\n            apps/webapp/app/features/flowcordia/workflows/drafts/types.ts \\\n''',
)
replace_once(
    workflow,
    '''            apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx \\\n            apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioEdgeInspector.tsx \\\n''',
    '''            apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx \\\n            apps/webapp/app/features/flowcordia/workflows/studio/canvas-selection.test.ts \\\n            apps/webapp/app/features/flowcordia/workflows/studio/canvas-selection.ts \\\n            apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioEdgeInspector.tsx \\\n''',
)
replace_once(
    workflow,
    '''            packages/flowcordia-workflow/src/editor.fast-create.test.ts \\\n            packages/flowcordia-workflow/src/editor.ts \\\n''',
    '''            packages/flowcordia-workflow/src/editor.fast-create.test.ts \\\n            packages/flowcordia-workflow/src/editor.selection.test.ts \\\n            packages/flowcordia-workflow/src/editor.ts \\\n''',
)
