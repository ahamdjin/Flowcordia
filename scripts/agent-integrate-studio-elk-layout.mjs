import { readFileSync, writeFileSync } from "node:fs";

const canvasPath =
  "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx";
let source = readFileSync(canvasPath, "utf8");

if (source.includes('data-testid="flowcordia-arrange-workflow"')) {
  console.log("Studio automatic layout is already integrated.");
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Missing ${label} marker.`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Ambiguous ${label} marker.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import { workflowStudioCanvasEdgeLabel } from "./canvas-edges";\n',
  'import { workflowStudioCanvasEdgeLabel } from "./canvas-edges";\nimport { buildWorkflowStudioAutoLayoutCommand } from "./canvas-layout";\n',
  "layout import"
);

replaceOnce(
  `  const [pendingRemoval, setPendingRemoval] = useState<{\n    nodeIds: string[];\n    edgeCount: number;\n  } | null>(null);\n  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(\n`,
  `  const [pendingRemoval, setPendingRemoval] = useState<{\n    nodeIds: string[];\n    edgeCount: number;\n  } | null>(null);\n  const [layoutBusy, setLayoutBusy] = useState(false);\n  const fitAfterLayoutRef = useRef(false);\n  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(\n`,
  "layout state"
);

replaceOnce(
  `  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges]);\n\n  useEffect(() => {\n    setAnnouncement(\n`,
  `  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges]);\n\n  useEffect(() => {\n    if (!fitAfterLayoutRef.current) return;\n    fitAfterLayoutRef.current = false;\n    void instanceRef.current?.fitView({\n      duration: 220,\n      padding: 0.18,\n      minZoom: MIN_ZOOM,\n      maxZoom: 1.2,\n    });\n  }, [graph.nodes]);\n\n  useEffect(() => {\n    setAnnouncement(\n`,
  "post-layout viewport effect"
);

replaceOnce(
  `  const handleConnectEnd: OnConnectEnd = (event, state) => {\n`,
  `  const arrangeWorkflow = async () => {\n    if (!editable || layoutBusy || graph.nodes.length < 2) return;\n    setLayoutBusy(true);\n    setAnnouncement(\`Arranging \${graph.nodes.length} workflow nodes.\`);\n    try {\n      const command = await buildWorkflowStudioAutoLayoutCommand({\n        graph,\n        nodeWidth: NODE_WIDTH,\n        nodeHeight: NODE_HEIGHT,\n        gridSize: GRID_SIZE,\n      });\n      if (!command) {\n        setAnnouncement("The workflow is already arranged on the current grid.");\n        return;\n      }\n      fitAfterLayoutRef.current = true;\n      onCommand(command);\n      setAnnouncement(\n        \`\${command.moves.length} node position\${command.moves.length === 1 ? "" : "s"} submitted as one automatic-layout edit. Undo restores the previous positions.\`\n      );\n    } catch (error) {\n      setAnnouncement(\n        error instanceof Error\n          ? \`Automatic layout failed: \${error.message}\`\n          : "Automatic layout failed unexpectedly."\n      );\n    } finally {\n      setLayoutBusy(false);\n    }\n  };\n\n  const handleConnectEnd: OnConnectEnd = (event, state) => {\n`,
  "arrange handler"
);

replaceOnce(
  `        to copy and paste selected nodes by identity, or D to duplicate them. Drag a source handle\n`,
  `        to copy and paste selected nodes by identity, or D to duplicate them. Use Arrange workflow\n        to submit one undoable left-to-right layout edit. Drag a source handle\n`,
  "canvas instructions"
);

replaceOnce(
  `                Add node\n              </button>\n              {selectedNodeIds.size > 0 && (\n`,
  `                Add node\n              </button>\n              <button\n                type="button"\n                data-testid="flowcordia-arrange-workflow"\n                className="nodrag nopan h-9 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 focus-custom"\n                disabled={layoutBusy || graph.nodes.length < 2}\n                aria-label="Arrange workflow left to right"\n                title="Arrange the workflow as one undoable draft edit"\n                onClick={() => void arrangeWorkflow()}\n              >\n                {layoutBusy ? "Arranging…" : "Arrange workflow"}\n              </button>\n              {selectedNodeIds.size > 0 && (\n`,
  "arrange button"
);

writeFileSync(canvasPath, source);
