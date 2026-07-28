import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  if (index === -1) throw new Error(`Missing ${label}`);
  if (source.indexOf(search, index + search.length) !== -1) {
    throw new Error(`Ambiguous ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing ${label} start`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`Missing ${label} end`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const editorPath = "packages/flowcordia-workflow/src/editor.ts";
let editor = fs.readFileSync(editorPath, "utf8");
editor = replaceOnce(
  editor,
  `  | {\n      type: "add_node";\n      templateId: WorkflowStudioTemplateId;\n      position: WorkflowEditPosition;\n      name?: string;\n    }\n  | { type: "move_node"; nodeId: string; position: WorkflowEditPosition }`,
  `  | {\n      type: "add_node";\n      templateId: WorkflowStudioTemplateId;\n      position: WorkflowEditPosition;\n      name?: string;\n    }\n  | {\n      type: "add_connected_node";\n      templateId: WorkflowStudioTemplateId;\n      position: WorkflowEditPosition;\n      source: string;\n      condition?: "true" | "false";\n      name?: string;\n    }\n  | {\n      type: "insert_node_on_edge";\n      templateId: WorkflowStudioTemplateId;\n      position: WorkflowEditPosition;\n      edgeId: string;\n      name?: string;\n    }\n  | { type: "move_node"; nodeId: string; position: WorkflowEditPosition }`,
  "fast creation command types"
);
editor = replaceOnce(
  editor,
  `function nextEdgeId(workflow: WorkflowDefinition, source: string, target: string): string {\n  return nextId(\`${"${source}"}_to_${"${target}"}\`, new Set(workflow.edges.map((edge) => edge.id)));\n}\n\nfunction finish(workflow: WorkflowDefinition): WorkflowEditResult {`,
  `function nextEdgeId(workflow: WorkflowDefinition, source: string, target: string): string {\n  return nextId(\`${"${source}"}_to_${"${target}"}\`, new Set(workflow.edges.map((edge) => edge.id)));\n}\n\nfunction createTemplateNode(\n  workflow: WorkflowDefinition,\n  template: WorkflowStudioNodeTemplate,\n  position: WorkflowEditPosition,\n  name?: string\n): WorkflowNode {\n  return {\n    id: nextNodeId(workflow, template),\n    name: name ?? template.defaultName,\n    kind: template.kind,\n    operation: template.operation,\n    position: { ...position },\n    configuration: JSON.parse(JSON.stringify(template.defaultConfiguration)) as JsonObject,\n    ...(template.defaultInputSchema\n      ? { inputSchema: JSON.parse(JSON.stringify(template.defaultInputSchema)) as JsonObject }\n      : {}),\n    ...(template.defaultOutputSchema\n      ? { outputSchema: JSON.parse(JSON.stringify(template.defaultOutputSchema)) as JsonObject }\n      : {}),\n  };\n}\n\nfunction connectNodesInWorkflow(\n  workflow: WorkflowDefinition,\n  input: {\n    source: string;\n    target: string;\n    condition?: "true" | "false";\n    edgeId?: string;\n    sourceHandle?: string;\n    targetHandle?: string;\n    insertAt?: number;\n  }\n): WorkflowEditResult | null {\n  const source = workflow.nodes.find((candidate) => candidate.id === input.source);\n  const target = workflow.nodes.find((candidate) => candidate.id === input.target);\n  if (!source) return failure("node_not_found", 'Node "' + input.source + '" does not exist.');\n  if (!target) return failure("node_not_found", 'Node "' + input.target + '" does not exist.');\n  if (source.id === target.id) {\n    return failure("self_connection", "A node cannot connect directly to itself.");\n  }\n  if (source.kind === "output") {\n    return failure("unsupported_connection", "Output nodes cannot connect to another node.");\n  }\n  if (target.kind === "trigger") {\n    return failure("unsupported_connection", "Trigger nodes cannot receive incoming connections.");\n  }\n  if (\n    isReachable(\n      workflow.nodes.map((node) => node.id),\n      workflow.edges,\n      target.id,\n      source.id\n    )\n  ) {\n    return failure("cycle", "That connection would create a directed cycle.");\n  }\n  if (source.operation === "control.condition" && input.condition === undefined) {\n    return failure(\n      "invalid_result",\n      "Connections leaving a condition node must select the true or false branch."\n    );\n  }\n  if (source.operation !== "control.condition" && input.condition !== undefined) {\n    return failure(\n      "invalid_result",\n      "Only condition nodes can create true or false branch connections."\n    );\n  }\n  if (\n    workflow.edges.some(\n      (edge) =>\n        edge.source === input.source &&\n        (edge.target === input.target ||\n          (input.condition !== undefined && edge.condition === input.condition))\n    )\n  ) {\n    return failure(\n      "duplicate_connection",\n      input.condition\n        ? "The " + input.condition + " branch is already connected."\n        : "Those nodes are already connected."\n    );\n  }\n  const edge = {\n    id: input.edgeId ?? nextEdgeId(workflow, input.source, input.target),\n    source: input.source,\n    target: input.target,\n    ...(input.sourceHandle === undefined ? {} : { sourceHandle: input.sourceHandle }),\n    ...(input.targetHandle === undefined ? {} : { targetHandle: input.targetHandle }),\n    ...(input.condition === undefined ? {} : { condition: input.condition }),\n  };\n  if (input.insertAt === undefined) workflow.edges.push(edge);\n  else workflow.edges.splice(input.insertAt, 0, edge);\n  return null;\n}\n\nfunction finish(workflow: WorkflowDefinition): WorkflowEditResult {`,
  "editor helpers"
);
editor = replaceRange(
  editor,
  `    case "add_node": {`,
  `    case "move_node": {`,
  `    case "add_node": {\n      const template = templateFor(command.templateId);\n      if (!template) {\n        return failure("unsupported_template", "The selected Studio node template is unsupported.");\n      }\n      workflow.nodes.push(createTemplateNode(workflow, template, command.position, command.name));\n      return finish(workflow);\n    }\n    case "add_connected_node": {\n      const template = templateFor(command.templateId);\n      if (!template) {\n        return failure("unsupported_template", "The selected Studio node template is unsupported.");\n      }\n      const node = createTemplateNode(workflow, template, command.position, command.name);\n      workflow.nodes.push(node);\n      const connectionFailure = connectNodesInWorkflow(workflow, {\n        source: command.source,\n        target: node.id,\n        ...(command.condition === undefined ? {} : { condition: command.condition }),\n      });\n      if (connectionFailure) return connectionFailure;\n      return finish(workflow);\n    }\n    case "insert_node_on_edge": {\n      const edgeIndex = workflow.edges.findIndex((candidate) => candidate.id === command.edgeId);\n      if (edgeIndex === -1) {\n        return failure("edge_not_found", 'Edge "' + command.edgeId + '" does not exist.');\n      }\n      const template = templateFor(command.templateId);\n      if (!template) {\n        return failure("unsupported_template", "The selected Studio node template is unsupported.");\n      }\n      const current = workflow.edges[edgeIndex]!;\n      workflow.edges.splice(edgeIndex, 1);\n      const node = createTemplateNode(workflow, template, command.position, command.name);\n      workflow.nodes.push(node);\n      const condition =\n        current.condition === "true" || current.condition === "false"\n          ? current.condition\n          : undefined;\n      const incomingFailure = connectNodesInWorkflow(workflow, {\n        source: current.source,\n        target: node.id,\n        edgeId: current.id,\n        insertAt: edgeIndex,\n        ...(current.sourceHandle === undefined ? {} : { sourceHandle: current.sourceHandle }),\n        ...(condition === undefined ? {} : { condition }),\n      });\n      if (incomingFailure) return incomingFailure;\n      const outgoingFailure = connectNodesInWorkflow(workflow, {\n        source: node.id,\n        target: current.target,\n        insertAt: edgeIndex + 1,\n        ...(current.targetHandle === undefined ? {} : { targetHandle: current.targetHandle }),\n      });\n      if (outgoingFailure) return outgoingFailure;\n      return finish(workflow);\n    }\n`,
  "fast creation editor cases"
);
editor = replaceRange(
  editor,
  `    case "connect_nodes": {`,
  `    case "replace_edge": {`,
  `    case "connect_nodes": {\n      const connectionFailure = connectNodesInWorkflow(workflow, {\n        source: command.source,\n        target: command.target,\n        ...(command.condition === undefined ? {} : { condition: command.condition }),\n      });\n      if (connectionFailure) return connectionFailure;\n      return finish(workflow);\n    }\n`,
  "connect nodes case"
);
fs.writeFileSync(editorPath, editor);

const draftTypesPath = "apps/webapp/app/features/flowcordia/workflows/drafts/types.ts";
let draftTypes = fs.readFileSync(draftTypesPath, "utf8");
draftTypes = replaceOnce(
  draftTypes,
  `    case "add_node":\n      return { command: command.type, templateId: command.templateId };\n    case "add_function_node":`,
  `    case "add_node":\n      return { command: command.type, templateId: command.templateId };\n    case "add_connected_node":\n      return {\n        command: command.type,\n        templateId: command.templateId,\n        source: command.source,\n        condition: command.condition ?? null,\n      };\n    case "insert_node_on_edge":\n      return {\n        command: command.type,\n        templateId: command.templateId,\n        edgeId: command.edgeId,\n      };\n    case "add_function_node":`,
  "draft command summaries"
);
fs.writeFileSync(draftTypesPath, draftTypes);

const studioPath = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudio.tsx";
let studio = fs.readFileSync(studioPath, "utf8");
studio = replaceOnce(
  studio,
  `import { type WorkflowEditCommand, type WorkflowStudioTemplateId } from "@flowcordia/workflow";`,
  `import { type WorkflowEditCommand } from "@flowcordia/workflow";`,
  "Studio workflow import"
);
studio = replaceOnce(
  studio,
  `import { WorkflowStudioNodeCatalogPicker } from "./WorkflowStudioNodeCatalogPicker";\n`,
  ``,
  "catalog picker import"
);
studio = replaceOnce(
  studio,
  `  const [templateId, setTemplateId] = useState<WorkflowStudioTemplateId>("http_action");\n`,
  ``,
  "template state"
);
studio = replaceOnce(
  studio,
  `  const [lastProposal, setLastProposal] = useState<DraftResponse["proposal"] | null>(null);\n`,
  `  const [lastProposal, setLastProposal] = useState<DraftResponse["proposal"] | null>(null);\n  const pendingCreatedNodeIds = useRef<ReadonlySet<string> | null>(null);\n`,
  "pending created node ref"
);
studio = replaceOnce(
  studio,
  `  const selectEdge = (edgeId: string | null) => {\n    setSelectedEdgeId(edgeId);\n    if (edgeId !== null) setSelectedNodeId(null);\n  };\n\n  useEffect(() => {`,
  `  const selectEdge = (edgeId: string | null) => {\n    setSelectedEdgeId(edgeId);\n    if (edgeId !== null) setSelectedNodeId(null);\n  };\n\n  useEffect(() => {\n    const previousNodeIds = pendingCreatedNodeIds.current;\n    if (!previousNodeIds || !graph) return;\n    const createdNode = graph.nodes.find((node) => !previousNodeIds.has(node.id));\n    if (!createdNode) return;\n    pendingCreatedNodeIds.current = null;\n    selectNode(createdNode.id);\n  }, [draft?.version, graph]);\n\n  useEffect(() => {`,
  "created node selection effect"
);
studio = replaceOnce(
  studio,
  `  const submitEdit = (command: WorkflowStudioEditCommand) => {\n    if (!draft || !editable) return;\n    submitDraft({\n      operation: "edit",\n      draftId: draft.publicId,\n      expectedVersion: draft.version,\n      command,\n    });\n  };\n\n  const addNode = () => {\n    if (!graph || !editable) return;\n    const index = graph.nodes.length;\n    submitEdit({\n      type: "add_node",\n      templateId,\n      position: {\n        x: 80 + (index % 4) * 280,\n        y: 80 + Math.floor(index / 4) * 180,\n      },\n    });\n  };\n\n  const addFunctionNode = () => {`,
  `  const submitEdit = (command: WorkflowStudioEditCommand) => {\n    if (!draft || !editable) return;\n    submitDraft({\n      operation: "edit",\n      draftId: draft.publicId,\n      expectedVersion: draft.version,\n      command,\n    });\n  };\n\n  const submitCanvasCommand = (command: WorkflowEditCommand) => {\n    if (\n      graph &&\n      (command.type === "add_node" ||\n        command.type === "add_connected_node" ||\n        command.type === "insert_node_on_edge")\n    ) {\n      pendingCreatedNodeIds.current = new Set(graph.nodes.map((node) => node.id));\n    }\n    submitEdit(command);\n  };\n\n  const addFunctionNode = () => {`,
  "canvas command submission"
);
const catalogStart = `            {graph && draft && (\n              <div className="border-b border-white/10 bg-[#141416] px-4 py-3">`;
const canvasStart = `            <div className="min-h-0 flex-1">`;
const catalogIndex = studio.indexOf(catalogStart);
const canvasIndex = studio.indexOf(canvasStart, catalogIndex);
if (catalogIndex === -1 || canvasIndex === -1) throw new Error("Missing permanent catalog block");
studio =
  studio.slice(0, catalogIndex) +
  `            {graph &&\n              draft &&\n              (functionCatalog.state === "READY" || functionCatalog.message) && (\n                <div className="flex min-h-12 items-center gap-2 border-b border-white/10 bg-[#141416] px-4 py-2">\n                  {functionCatalog.state === "READY" && functionCatalog.functions.length > 0 && (\n                    <>\n                      <label className="w-full max-w-64">\n                        <span className="sr-only">Repository function</span>\n                        <select\n                          className={inputClassName}\n                          value={functionId}\n                          disabled={!editable || draftBusy}\n                          onChange={(event) => setFunctionId(event.target.value)}\n                        >\n                          {functionCatalog.functions.map((definition) => (\n                            <option key={definition.id} value={definition.id}>\n                              {definition.name}\n                            </option>\n                          ))}\n                        </select>\n                      </label>\n                      <Button\n                        variant="secondary/small"\n                        disabled={!editable || draftBusy || !functionId}\n                        isLoading={draftBusy}\n                        onClick={addFunctionNode}\n                      >\n                        Add repository function\n                      </Button>\n                    </>\n                  )}\n                  <div\n                    className={cn(\n                      "min-w-0 flex-1 truncate text-[10px]",\n                      functionCatalog.state === "INVALID" || functionCatalog.state === "UNAVAILABLE"\n                        ? "text-yellow-300"\n                        : "text-zinc-500"\n                    )}\n                    title={functionCatalog.message ?? undefined}\n                  >\n                    {functionCatalog.message ??\n                      "Developer-owned code stays versioned in the connected repository."}\n                  </div>\n                </div>\n              )}\n\n` +
  studio.slice(canvasIndex);
studio = replaceOnce(
  studio,
  `                      onConnect={submitEdit}\n`,
  `                      onCommand={submitCanvasCommand}\n`,
  "canvas command prop"
);
fs.writeFileSync(studioPath, studio);

const canvasPath = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx";
let canvas = fs.readFileSync(canvasPath, "utf8");
canvas = replaceOnce(
  canvas,
  `import type { KeyboardEvent as ReactKeyboardEvent } from "react";\n`,
  `import { PlusIcon } from "lucide-react";\nimport type { KeyboardEvent as ReactKeyboardEvent } from "react";\n`,
  "canvas plus icon import"
);
canvas = replaceOnce(
  canvas,
  `import type { WorkflowStudioGraph, WorkflowStudioNode } from "./presentation";\n`,
  `import type { WorkflowStudioGraph, WorkflowStudioNode } from "./presentation";\nimport { WorkflowStudioQuickNodeCreator } from "./WorkflowStudioQuickNodeCreator";\nimport type { WorkflowStudioQuickCreateContext } from "./quick-node-creator";\n`,
  "quick creator imports"
);
canvas = replaceRange(
  canvas,
  `type ConnectCommand = Extract<WorkflowEditCommand, { type: "connect_nodes" }>;`,
  `function nodeTone(`,
  `type QuickCreateRequest =\n  | {\n      context: "standalone";\n      position: { x: number; y: number };\n    }\n  | {\n      context: "after_source";\n      position: { x: number; y: number };\n      source: string;\n      condition?: "true" | "false";\n    }\n  | {\n      context: "on_edge";\n      position: { x: number; y: number };\n      edgeId: string;\n    };\n\ntype QuickCreateState = QuickCreateRequest & { anchor: { left: number; top: number } };\n\ntype CanvasNodeData = {\n  node: WorkflowStudioNode;\n  liveNode: FlowcordiaLiveNodeState | undefined;\n  incoming: number;\n  outgoing: number;\n  editable: boolean;\n  sourceHandles: ReturnType<typeof workflowStudioCanvasSourceHandles>;\n  onQuickCreate: (request: QuickCreateRequest) => void;\n};\n\ntype CanvasNode = Node<CanvasNodeData, "flowcordia">;\ntype CanvasEdgeData = {\n  condition: "true" | "false" | null;\n  editable: boolean;\n  onQuickCreate: (request: QuickCreateRequest) => void;\n};\ntype CanvasEdge = Edge<CanvasEdgeData, "flowcordia">;\n\nfunction nodeTone(`,
  "canvas quick creation types"
);
canvas = replaceOnce(
  canvas,
  `function sourceHandleTop(condition: "true" | "false" | null): string {\n  if (condition === "true") return "30%";\n  if (condition === "false") return "70%";\n  return "50%";\n}\n`,
  `function sourceHandleTop(condition: "true" | "false" | null): string {\n  if (condition === "true") return "30%";\n  if (condition === "false") return "70%";\n  return "50%";\n}\n\nfunction sourceHandleOffset(condition: "true" | "false" | null): number {\n  if (condition === "true") return 31;\n  if (condition === "false") return 73;\n  return 52;\n}\n\nfunction eventClientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {\n  if ("changedTouches" in event) {\n    const touch = event.changedTouches[0];\n    return touch ? { x: touch.clientX, y: touch.clientY } : null;\n  }\n  return { x: event.clientX, y: event.clientY };\n}\n`,
  "canvas positioning helpers"
);
canvas = replaceOnce(
  canvas,
  `        "relative h-[104px] w-[216px] select-none rounded-[10px] border bg-white p-3 text-left text-zinc-800 shadow-[0_2px_8px_rgba(24,24,27,0.08)] transition duration-150",`,
  `        "group relative h-[104px] w-[216px] select-none rounded-[10px] border bg-white p-3 text-left text-zinc-800 shadow-[0_2px_8px_rgba(24,24,27,0.08)] transition duration-150",`,
  "canvas node group"
);
const handlesStart = canvas.indexOf(`      {data.sourceHandles.map((handle) => (`);
const handlesEndMarker = `      ))}\n    </div>`;
const handlesEnd = canvas.indexOf(handlesEndMarker, handlesStart);
if (handlesStart === -1 || handlesEnd === -1) throw new Error("Missing canvas source handles");
canvas =
  canvas.slice(0, handlesStart) +
  `      {data.sourceHandles.map((handle) => (\n        <div\n          key={handle.id}\n          className="absolute right-0"\n          style={{ top: sourceHandleTop(handle.condition) }}\n        >\n          <Handle\n            id={handle.condition ?? "next"}\n            type="source"\n            position={Position.Right}\n            isConnectable={data.editable && handle.available}\n            aria-label={\`${"${handle.label}"} from ${"${node.name}"}\`}\n            title={handle.reason ?? handle.label}\n            className={cn(\n              "!size-4 !border-2 transition",\n              handle.available\n                ? "!border-[#ff6d5a] !bg-white hover:!bg-[#ff6d5a]"\n                : "!border-zinc-300 !bg-zinc-100 opacity-40"\n            )}\n          />\n          {data.editable && handle.available && (\n            <button\n              type="button"\n              className={cn(\n                "nodrag nopan absolute left-5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-[#ff6d5a]/40 bg-white text-[#e95745] shadow-sm transition hover:border-[#ff6d5a] hover:bg-[#ff6d5a] hover:text-white focus-custom",\n                selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"\n              )}\n              aria-label={\`Add a node after ${"${node.name}"}${"${handle.condition ? ` on the ${handle.condition} branch` : \"\"}"}\`}\n              onClick={(event) => {\n                event.preventDefault();\n                event.stopPropagation();\n                data.onQuickCreate({\n                  context: "after_source",\n                  source: node.id,\n                  ...(handle.condition === null ? {} : { condition: handle.condition }),\n                  position: {\n                    x: node.position.x + NODE_WIDTH + 84,\n                    y: node.position.y + sourceHandleOffset(handle.condition) - NODE_HEIGHT / 2,\n                  },\n                });\n              }}\n            >\n              <PlusIcon className="size-3.5" aria-hidden="true" />\n            </button>\n          )}\n          {handle.condition && (\n            <span\n              aria-hidden="true"\n              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded bg-white px-1 font-mono text-[8px] font-semibold uppercase text-zinc-500 shadow-sm"\n            >\n              {handle.condition === "true" ? "T" : "F"}\n            </span>\n          )}\n        </div>\n      ))}` +
  canvas.slice(handlesEnd + `      ))}`.length);
canvas = replaceRange(
  canvas,
  `function FlowcordiaCanvasEdge(`,
  `const nodeTypes =`,
  `function FlowcordiaCanvasEdge(props: EdgeProps<CanvasEdge>) {\n  const [edgePath, labelX, labelY] = getBezierPath({\n    sourceX: props.sourceX,\n    sourceY: props.sourceY,\n    sourcePosition: props.sourcePosition,\n    targetX: props.targetX,\n    targetY: props.targetY,\n    targetPosition: props.targetPosition,\n  });\n  return (\n    <>\n      <BaseEdge\n        id={props.id}\n        path={edgePath}\n        markerEnd={props.markerEnd}\n        style={props.style}\n        interactionWidth={18}\n      />\n      {(props.data?.condition || (props.selected && props.data?.editable)) && (\n        <EdgeLabelRenderer>\n          <div\n            className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"\n            style={{ transform: \`translate(-50%, -50%) translate(${"${labelX}"}px, ${"${labelY}"}px)\` }}\n          >\n            {props.data?.condition && (\n              <span\n                aria-hidden="true"\n                className="pointer-events-none rounded border border-black/10 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500 shadow-sm"\n              >\n                {props.data.condition}\n              </span>\n            )}\n            {props.selected && props.data?.editable && (\n              <button\n                type="button"\n                className="nodrag nopan grid size-6 place-items-center rounded-full border border-[#ff6d5a]/40 bg-white text-[#e95745] shadow-sm transition hover:border-[#ff6d5a] hover:bg-[#ff6d5a] hover:text-white focus-custom"\n                aria-label="Insert a node into this connection"\n                onClick={(event) => {\n                  event.preventDefault();\n                  event.stopPropagation();\n                  props.data?.onQuickCreate({\n                    context: "on_edge",\n                    edgeId: props.id,\n                    position: { x: labelX, y: labelY },\n                  });\n                }}\n              >\n                <PlusIcon className="size-3.5" aria-hidden="true" />\n              </button>\n            )}\n          </div>\n        </EdgeLabelRenderer>\n      )}\n    </>\n  );\n}\n\nconst nodeTypes =`,
  "canvas edge creator"
);
canvas = replaceOnce(
  canvas,
  `  editable,\n}: {\n  graph: WorkflowStudioGraph;\n  liveNodesById: ReadonlyMap<string, FlowcordiaLiveNodeState>;\n  selectedNodeId: string | null;\n  editable: boolean;\n}): CanvasNode[] {`,
  `  editable,\n  onQuickCreate,\n}: {\n  graph: WorkflowStudioGraph;\n  liveNodesById: ReadonlyMap<string, FlowcordiaLiveNodeState>;\n  selectedNodeId: string | null;\n  editable: boolean;\n  onQuickCreate: (request: QuickCreateRequest) => void;\n}): CanvasNode[] {`,
  "build nodes creator argument"
);
canvas = replaceOnce(
  canvas,
  `        sourceHandles: workflowStudioCanvasSourceHandles(graph, node.id),\n`,
  `        sourceHandles: workflowStudioCanvasSourceHandles(graph, node.id),\n        onQuickCreate,\n`,
  "node creator data"
);
canvas = replaceOnce(
  canvas,
  `  editable,\n}: {\n  graph: WorkflowStudioGraph;\n  selectedEdgeId: string | null;\n  editable: boolean;\n}): CanvasEdge[] {`,
  `  editable,\n  onQuickCreate,\n}: {\n  graph: WorkflowStudioGraph;\n  selectedEdgeId: string | null;\n  editable: boolean;\n  onQuickCreate: (request: QuickCreateRequest) => void;\n}): CanvasEdge[] {`,
  "build edges creator argument"
);
canvas = replaceOnce(
  canvas,
  `      data: { condition },\n`,
  `      data: { condition, editable, onQuickCreate },\n`,
  "edge creator data"
);
canvas = canvas.replaceAll("  onConnect,\n", "  onCommand,\n");
canvas = replaceOnce(
  canvas,
  `  onConnect: (command: ConnectCommand | ReplaceEdgeCommand) => void;\n`,
  `  onCommand: (command: WorkflowEditCommand) => void;\n`,
  "canvas command callback type"
);
canvas = replaceOnce(
  canvas,
  `  const instanceRef = useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);\n`,
  `  const wrapperRef = useRef<HTMLDivElement>(null);\n  const instanceRef = useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);\n  const connectionSourceRef = useRef<{\n    source: string;\n    condition?: "true" | "false";\n  } | null>(null);\n  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);\n`,
  "canvas creator state"
);
canvas = replaceOnce(
  canvas,
  `  const liveNodesById = useMemo(\n    () => new Map(liveNodes.map((node) => [node.nodeId, node])),\n    [liveNodes]\n  );\n  const initialNodes = useMemo(`,
  `  const liveNodesById = useMemo(\n    () => new Map(liveNodes.map((node) => [node.nodeId, node])),\n    [liveNodes]\n  );\n  const openQuickCreate = useCallback(\n    (request: QuickCreateRequest, clientPoint?: { x: number; y: number }) => {\n      if (!editable) return;\n      const instance = instanceRef.current;\n      const bounds = wrapperRef.current?.getBoundingClientRect();\n      if (!instance || !bounds) return;\n      const screenPoint = clientPoint ?? instance.flowToScreenPosition(request.position);\n      const left = Math.min(Math.max(12, screenPoint.x - bounds.left), Math.max(12, bounds.width - 364));\n      const top = Math.min(Math.max(12, screenPoint.y - bounds.top), Math.max(12, bounds.height - 430));\n      setQuickCreate({ ...request, anchor: { left, top } });\n      setAnnouncement(\n        request.context === "on_edge"\n          ? "Choose a node to insert into the selected connection."\n          : request.context === "after_source"\n            ? "Choose the next node."\n            : "Choose a node to add to the workflow."\n      );\n    },\n    [editable]\n  );\n  const initialNodes = useMemo(`,
  "open quick creator callback"
);
canvas = replaceOnce(
  canvas,
  `    () => buildNodes({ graph, liveNodesById, selectedNodeId, editable }),\n    [editable, graph, liveNodesById, selectedNodeId]\n`,
  `    () =>\n      buildNodes({ graph, liveNodesById, selectedNodeId, editable, onQuickCreate: openQuickCreate }),\n    [editable, graph, liveNodesById, openQuickCreate, selectedNodeId]\n`,
  "initial creator nodes"
);
canvas = replaceOnce(
  canvas,
  `    () => buildEdges({ graph, selectedEdgeId, editable }),\n    [editable, graph, selectedEdgeId]\n`,
  `    () => buildEdges({ graph, selectedEdgeId, editable, onQuickCreate: openQuickCreate }),\n    [editable, graph, openQuickCreate, selectedEdgeId]\n`,
  "initial creator edges"
);
canvas = canvas.replaceAll("      onConnect(result.command);", "      onCommand(result.command);");
canvas = canvas.replaceAll("[graph, onConnect]", "[graph, onCommand]");
canvas = replaceOnce(
  canvas,
  `  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {`,
  `  const handleQuickChoose = (templateId: import("@flowcordia/workflow").WorkflowStudioTemplateId) => {\n    if (!quickCreate) return;\n    const position = { x: snap(quickCreate.position.x), y: snap(quickCreate.position.y) };\n    if (quickCreate.context === "standalone") {\n      onCommand({ type: "add_node", templateId, position });\n    } else if (quickCreate.context === "after_source") {\n      onCommand({\n        type: "add_connected_node",\n        templateId,\n        position,\n        source: quickCreate.source,\n        ...(quickCreate.condition === undefined ? {} : { condition: quickCreate.condition }),\n      });\n    } else {\n      onCommand({\n        type: "insert_node_on_edge",\n        templateId,\n        position,\n        edgeId: quickCreate.edgeId,\n      });\n    }\n    setQuickCreate(null);\n    setAnnouncement("Node creation submitted through the workflow draft.");\n  };\n\n  const openAtViewportCenter = () => {\n    const instance = instanceRef.current;\n    const bounds = wrapperRef.current?.getBoundingClientRect();\n    if (!instance || !bounds) return;\n    const clientPoint = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };\n    openQuickCreate(\n      { context: "standalone", position: instance.screenToFlowPosition(clientPoint) },\n      clientPoint\n    );\n  };\n\n  const handleConnectEnd = (event: MouseEvent | TouchEvent, state: { isValid: boolean; toNode: unknown }) => {\n    const source = connectionSourceRef.current;\n    connectionSourceRef.current = null;\n    if (!source || state.isValid || state.toNode) return;\n    const clientPoint = eventClientPoint(event);\n    const instance = instanceRef.current;\n    if (!clientPoint || !instance) return;\n    openQuickCreate(\n      {\n        context: "after_source",\n        source: source.source,\n        ...(source.condition === undefined ? {} : { condition: source.condition }),\n        position: instance.screenToFlowPosition(clientPoint),\n      },\n      clientPoint\n    );\n  };\n\n  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {`,
  "canvas quick creator handlers"
);
canvas = replaceOnce(
  canvas,
  `    <div\n      role="region"`,
  `    <div\n      ref={wrapperRef}\n      role="region"`,
  "canvas wrapper ref"
);
canvas = replaceOnce(
  canvas,
  `        nodes from the inspector. Use the canvas controls to zoom and fit the workflow; trackpad,\n        mouse-wheel, and pinch gestures pan or zoom.`,
  `        nodes from the inspector. Double-click empty canvas space, use the Add node button, click\n        the plus beside a selected output, or drop a connection on empty space to open the node\n        creator. Select a connection to insert a node at its midpoint. Use the canvas controls to zoom\n        and fit the workflow; trackpad, mouse-wheel, and pinch gestures pan or zoom.`,
  "canvas instructions"
);
canvas = replaceOnce(
  canvas,
  `        onNodeClick={(_event, node) => {`,
  `        onConnectStart={(_event, params) => {\n          if (!params.nodeId) return;\n          connectionSourceRef.current = {\n            source: params.nodeId,\n            ...(params.handleId === "true" || params.handleId === "false"\n              ? { condition: params.handleId }\n              : {}),\n          };\n        }}\n        onConnectEnd={handleConnectEnd}\n        onNodeClick={(_event, node) => {`,
  "connection drop creator events"
);
canvas = replaceOnce(
  canvas,
  `        onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}\n        onPaneClick={() => onSelectEdge(null)}\n`,
  `        onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}\n        onEdgeDoubleClick={(event, edge) => {\n          event.preventDefault();\n          const instance = instanceRef.current;\n          if (!instance) return;\n          const clientPoint = { x: event.clientX, y: event.clientY };\n          openQuickCreate(\n            {\n              context: "on_edge",\n              edgeId: edge.id,\n              position: instance.screenToFlowPosition(clientPoint),\n            },\n            clientPoint\n          );\n        }}\n        onPaneDoubleClick={(event) => {\n          const instance = instanceRef.current;\n          if (!instance) return;\n          const clientPoint = { x: event.clientX, y: event.clientY };\n          openQuickCreate(\n            { context: "standalone", position: instance.screenToFlowPosition(clientPoint) },\n            clientPoint\n          );\n        }}\n        onPaneClick={() => {\n          onSelectEdge(null);\n          setQuickCreate(null);\n        }}\n`,
  "pane and edge creator events"
);
canvas = replaceOnce(
  canvas,
  `        <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="#d4d4d8" />\n        <Controls`,
  `        <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="#d4d4d8" />\n        {editable && (\n          <Panel position="top-left" className="!m-3">\n            <button\n              type="button"\n              data-testid="flowcordia-open-quick-node-creator"\n              className="nodrag nopan flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 focus-custom"\n              onClick={openAtViewportCenter}\n            >\n              <PlusIcon className="size-4 text-[#e95745]" aria-hidden="true" />\n              Add node\n            </button>\n          </Panel>\n        )}\n        <Controls`,
  "canvas add node panel"
);
canvas = replaceOnce(
  canvas,
  `        <MiniMap\n          position="bottom-right"\n          pannable\n          zoomable\n          nodeColor={minimapNodeColor}\n          nodeStrokeColor={(node) => (node.selected ? "#ff6d5a" : "#ffffff")}\n          nodeStrokeWidth={3}\n          maskColor="rgba(24,24,27,0.08)"\n          className="!m-3 !rounded-lg !border !border-black/10 !bg-white/95 !shadow-[0_8px_28px_rgba(24,24,27,0.12)]"\n        />`,
  `        {graph.nodes.length >= 8 && (\n          <MiniMap\n            position="bottom-right"\n            pannable\n            zoomable\n            nodeColor={minimapNodeColor}\n            nodeStrokeColor={(node) => (node.selected ? "#ff6d5a" : "#ffffff")}\n            nodeStrokeWidth={3}\n            maskColor="rgba(24,24,27,0.08)"\n            className="!m-3 !rounded-lg !border !border-black/10 !bg-white/95 !shadow-[0_8px_28px_rgba(24,24,27,0.12)]"\n          />\n        )}`,
  "conditional minimap"
);
canvas = replaceOnce(
  canvas,
  `      </ReactFlow>\n    </div>`,
  `      </ReactFlow>\n      {quickCreate && (\n        <div\n          className="absolute z-50"\n          style={{ left: quickCreate.anchor.left, top: quickCreate.anchor.top }}\n        >\n          <WorkflowStudioQuickNodeCreator\n            context={quickCreate.context as WorkflowStudioQuickCreateContext}\n            disabled={!editable}\n            onChoose={handleQuickChoose}\n            onClose={() => setQuickCreate(null)}\n          />\n        </div>\n      )}\n    </div>`,
  "quick creator overlay"
);
fs.writeFileSync(canvasPath, canvas);
