import { readFileSync, writeFileSync } from "node:fs";

function edit(path, transform) {
  const source = readFileSync(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`No change produced for ${path}`);
  writeFileSync(path, next);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Missing ${label} marker.`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Ambiguous ${label} marker.`);
  }
  return source.replace(before, after);
}

edit("packages/flowcordia-workflow/src/editor.ts", (source) => {
  if (source.includes("export function pasteWorkflowSubgraph")) return source;
  const marker = "export function applyWorkflowEdit(\n";
  const helper = `export function pasteWorkflowSubgraph(input: {\n  target: WorkflowDefinition;\n  source: WorkflowDefinition;\n  nodeIds: readonly string[];\n  offset: WorkflowPosition;\n}): WorkflowEditResult {\n  const workflow = cloneWorkflow(input.target);\n  const selectedIds = new Set(input.nodeIds);\n  if (selectedIds.size !== input.nodeIds.length) {\n    return failure("invalid_result", "Node IDs must be unique.");\n  }\n  const originals = input.source.nodes.filter((node) => selectedIds.has(node.id));\n  if (originals.length !== selectedIds.size) {\n    const missingNodeId = input.nodeIds.find(\n      (nodeId) => !input.source.nodes.some((node) => node.id === nodeId)\n    );\n    return failure("node_not_found", \`Node "\${missingNodeId ?? "unknown"}" does not exist.\`);\n  }\n\n  const usedNodeIds = new Set(workflow.nodes.map((node) => node.id));\n  const pastedNodeIds = new Map<string, string>();\n  const pastedNodes = originals.map((node) => {\n    const id = nextId(node.id, usedNodeIds);\n    usedNodeIds.add(id);\n    pastedNodeIds.set(node.id, id);\n    const pasted = JSON.parse(JSON.stringify(node)) as WorkflowNode;\n    pasted.id = id;\n    pasted.position = {\n      x: node.position.x + input.offset.x,\n      y: node.position.y + input.offset.y,\n    };\n    if (pasted.name) pasted.name = \`\${pasted.name} copy\`.slice(0, 160);\n    return pasted;\n  });\n  workflow.nodes.push(...pastedNodes);\n\n  const usedEdgeIds = new Set(workflow.edges.map((edge) => edge.id));\n  const pastedEdges = input.source.edges\n    .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))\n    .map((edge) => {\n      const pasted = JSON.parse(JSON.stringify(edge)) as (typeof workflow.edges)[number];\n      pasted.id = nextId(edge.id, usedEdgeIds);\n      usedEdgeIds.add(pasted.id);\n      pasted.source = pastedNodeIds.get(edge.source)!;\n      pasted.target = pastedNodeIds.get(edge.target)!;\n      return pasted;\n    });\n  workflow.edges.push(...pastedEdges);\n  return finish(workflow);\n}\n\n`;
  return replaceOnce(source, marker, helper + marker, "portable paste helper");
});

edit("apps/webapp/app/features/flowcordia/workflows/drafts/types.ts", (source) => {
  if (source.includes("WorkflowDraftPasteSubgraphCommand")) return source;
  source = replaceOnce(
    source,
    `export type WorkflowDraftAddFunctionNodeCommand = {\n  type: "add_function_node";\n  functionId: string;\n  position: { x: number; y: number } & JsonObject;\n  name?: string;\n} & JsonObject;\n\nexport type WorkflowDraftEditCommand = WorkflowEditCommand | WorkflowDraftAddFunctionNodeCommand;\n`,
    `export type WorkflowDraftAddFunctionNodeCommand = {\n  type: "add_function_node";\n  functionId: string;\n  position: { x: number; y: number } & JsonObject;\n  name?: string;\n} & JsonObject;\n\nexport type WorkflowDraftPasteSubgraphCommand = {\n  type: "paste_subgraph";\n  sourceWorkflowId: string;\n  sourceDraftPublicId: string;\n  sourceDraftVersion: string;\n  sourceDocumentSha256: string;\n  nodeIds: string[];\n  offset: { x: number; y: number } & JsonObject;\n} & JsonObject;\n\nexport type WorkflowDraftEditCommand =\n  | WorkflowEditCommand\n  | WorkflowDraftAddFunctionNodeCommand\n  | WorkflowDraftPasteSubgraphCommand;\n`,
    "draft paste type"
  );
  return replaceOnce(
    source,
    `    case "add_function_node":\n      return { command: command.type, functionId: command.functionId };\n`,
    `    case "add_function_node":\n      return { command: command.type, functionId: command.functionId };\n    case "paste_subgraph":\n      return {\n        command: command.type,\n        sourceWorkflowId: command.sourceWorkflowId,\n        sourceDraftPublicId: command.sourceDraftPublicId,\n        sourceDraftVersion: command.sourceDraftVersion,\n        sourceDocumentSha256: command.sourceDocumentSha256,\n        nodeIds: command.nodeIds,\n        nodeCount: command.nodeIds.length,\n        offset: command.offset,\n      };\n`,
    "draft paste summary"
  );
});

edit("apps/webapp/app/features/flowcordia/workflows/drafts/commands.server.ts", (source) => {
  if (source.includes("WorkflowPasteSubgraphCommand")) return source;
  source = replaceOnce(
    source,
    `import { WorkflowDraftRedoCommand, WorkflowDraftUndoCommand } from "./history-command-contract";\n`,
    `import { WorkflowDraftRedoCommand, WorkflowDraftUndoCommand } from "./history-command-contract";\nimport { WorkflowPasteSubgraphCommand } from "./paste-command-contract";\n`,
    "paste contract import"
  );
  return replaceOnce(
    source,
    `  WorkflowMoveNodesCommand,\n  WorkflowDuplicateSubgraphCommand,\n`,
    `  WorkflowMoveNodesCommand,\n  WorkflowDuplicateSubgraphCommand,\n  WorkflowPasteSubgraphCommand,\n`,
    "paste command union"
  );
});

edit("apps/webapp/app/features/flowcordia/workflows/drafts/service.server.ts", (source) => {
  if (source.includes("sourceDraftVersion")) return source;
  source = replaceOnce(
    source,
    `  parseFlowcordiaSubflowConfiguration,\n  resolveWorkflowFunctionFixture,\n`,
    `  parseFlowcordiaSubflowConfiguration,\n  pasteWorkflowSubgraph,\n  resolveWorkflowFunctionFixture,\n`,
    "portable paste import"
  );
  return replaceOnce(
    source,
    `  } else if (input.command.type === "add_function_node") {\n`,
    `  } else if (input.command.type === "paste_subgraph") {\n    const sourceDraft = await getActiveWorkflowDraftByPublicId(\n      input.scope,\n      input.command.sourceDraftPublicId\n    );\n    if (!sourceDraft || sourceDraft.workflowId !== input.command.sourceWorkflowId) {\n      throw new WorkflowDraftError(\n        "draft_not_found",\n        "The copied source draft is no longer available. Copy the nodes again before pasting."\n      );\n    }\n    if (\n      sourceDraft.version !== BigInt(input.command.sourceDraftVersion) ||\n      sourceDraft.documentSha256 !== input.command.sourceDocumentSha256\n    ) {\n      throw new WorkflowDraftError(\n        "draft_conflict",\n        "The copied source workflow changed after these nodes were copied. Copy them again before pasting."\n      );\n    }\n    const sourceEntry = await getWorkflowIndexEntry(input.scope, sourceDraft.workflowId);\n    if (!sourceEntry || !matchesBase(sourceDraft, sourceEntry)) {\n      throw new WorkflowDraftError(\n        "stale_source",\n        "The copied source workflow is stale. Synchronize it and copy the nodes again."\n      );\n    }\n    if (sourceDraft.baseCommitSha !== draft.baseCommitSha) {\n      throw new WorkflowDraftError(\n        "stale_source",\n        "Source and target workflows must come from the same repository revision. Synchronize both workflows and copy again."\n      );\n    }\n    edited = pasteWorkflowSubgraph({\n      target: draft.document,\n      source: sourceDraft.document,\n      nodeIds: input.command.nodeIds,\n      offset: input.command.offset,\n    });\n  } else if (input.command.type === "add_function_node") {\n`,
    "paste service branch"
  ).replace(
    `  if (configuredNode?.operation === "subflow.invoke") {\n    await assertWorkflowDocumentDependencies(input.scope, edited.workflow, draft.baseCommitSha);\n  }\n`,
    `  if (\n    configuredNode?.operation === "subflow.invoke" ||\n    input.command.type === "paste_subgraph"\n  ) {\n    await assertWorkflowDocumentDependencies(input.scope, edited.workflow, draft.baseCommitSha);\n  }\n`
  );
});

edit("apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudio.tsx", (source) => {
  if (source.includes("clipboardSource={{")) return source;
  source = replaceOnce(
    source,
    `import type { WorkflowDraftAddFunctionNodeCommand } from "../drafts/types";\n`,
    `import type { WorkflowDraftEditCommand } from "../drafts/types";\n`,
    "draft edit import"
  );
  source = replaceOnce(
    source,
    `type WorkflowStudioEditCommand = WorkflowEditCommand | WorkflowDraftAddFunctionNodeCommand;\n`,
    `type WorkflowStudioEditCommand = WorkflowDraftEditCommand;\n`,
    "studio edit type"
  );
  source = replaceOnce(
    source,
    `  const submitCanvasCommand = (command: WorkflowEditCommand) => {\n`,
    `  const submitCanvasCommand = (command: WorkflowDraftEditCommand) => {\n`,
    "canvas command type"
  );
  return replaceOnce(
    source,
    `                      editable={editable && !draftBusy}\n                      onSelectNode={selectNode}\n`,
    `                      editable={editable && !draftBusy}\n                      clipboardSource={\n                        draft\n                          ? {\n                              draftPublicId: draft.publicId,\n                              draftVersion: draft.version,\n                              documentSha256: draft.documentSha256,\n                            }\n                          : null\n                      }\n                      onSelectNode={selectNode}\n`,
    "canvas clipboard source"
  );
});

edit("apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx", (source) => {
  if (source.includes("buildWorkflowStudioCrossWorkflowPasteCommand")) return source;
  source = replaceOnce(
    source,
    `import type { WorkflowEditCommand } from "@flowcordia/workflow";\n`,
    `import type { WorkflowEditCommand } from "@flowcordia/workflow";\nimport type { WorkflowDraftEditCommand } from "../drafts/types";\n`,
    "canvas draft command import"
  );
  source = replaceOnce(
    source,
    `  FLOWCORDIA_NODE_CLIPBOARD_TYPE,\n  buildWorkflowStudioDuplicateCommand,\n`,
    `  FLOWCORDIA_NODE_CLIPBOARD_TYPE,\n  buildWorkflowStudioCrossWorkflowPasteCommand,\n  buildWorkflowStudioDuplicateCommand,\n`,
    "cross workflow helper import"
  );
  source = replaceOnce(
    source,
    `  editable,\n  onSelectNode,\n`,
    `  editable,\n  clipboardSource,\n  onSelectNode,\n`,
    "canvas prop destructure"
  );
  source = replaceOnce(
    source,
    `  editable: boolean;\n  onSelectNode: (id: string) => void;\n`,
    `  editable: boolean;\n  clipboardSource: {\n    draftPublicId: string;\n    draftVersion: string;\n    documentSha256: string;\n  } | null;\n  onSelectNode: (id: string) => void;\n`,
    "canvas clipboard prop type"
  );
  source = replaceOnce(
    source,
    `  onCommand: (command: WorkflowEditCommand) => void;\n`,
    `  onCommand: (command: WorkflowDraftEditCommand) => void;\n`,
    "canvas command prop type"
  );
  source = replaceOnce(
    source,
    `    const payload = createWorkflowStudioNodeClipboardPayload({\n      workflowId: graph.workflowId,\n      nodeIds: selectedNodeIdsInGraphOrder(),\n    });\n`,
    `    if (!clipboardSource) return;\n    const payload = createWorkflowStudioNodeClipboardPayload({\n      workflowId: graph.workflowId,\n      draftPublicId: clipboardSource.draftPublicId,\n      draftVersion: clipboardSource.draftVersion,\n      documentSha256: clipboardSource.documentSha256,\n      nodeIds: selectedNodeIdsInGraphOrder(),\n    });\n`,
    "exact clipboard creation"
  );
  return replaceOnce(
    source,
    `    if (payload.workflowId !== graph.workflowId) {\n      setAnnouncement("Copied nodes can be pasted only into the workflow they came from.");\n      return;\n    }\n    submitDuplicate(payload.nodeIds, nextDuplicateOffset());\n`,
    `    const offset = nextDuplicateOffset();\n    if (payload.workflowId === graph.workflowId) {\n      submitDuplicate(payload.nodeIds, offset);\n      return;\n    }\n    const command = buildWorkflowStudioCrossWorkflowPasteCommand({ payload, offset });\n    if (!command) return;\n    onCommand(command);\n    setAnnouncement(\n      \`\${command.nodeIds.length} node\${command.nodeIds.length === 1 ? "" : "s"} from \${command.sourceWorkflowId} submitted for cross-workflow paste.\`\n    );\n`,
    "cross workflow paste behavior"
  );
});
