import {
  STUDIO_V2_FOUNDATION_NODES,
  createStudioV2FoundationNode,
  type StudioV2FoundationNodeId,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowcordia/workflow";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useFetcher } from "@remix-run/react";
import {
  BracesIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDotIcon,
  GitBranchIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  UploadCloudIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "~/utils/cn";
import {
  buildStudioV2CanvasGraph,
  studioV2SelectedNode,
  type StudioV2CanvasNode,
} from "./presentation";
import type { StudioV2WorkspaceProjection } from "./workspace-contract";
import type { StudioV2WorkspaceActionData } from "./workspace-http";

function nodeKindTone(kind: WorkflowNode["kind"]): string {
  switch (kind) {
    case "trigger":
      return "border-emerald-400/35 bg-emerald-400/10 text-emerald-200";
    case "action":
      return "border-blue-400/35 bg-blue-400/10 text-blue-200";
    case "control":
      return "border-amber-400/35 bg-amber-400/10 text-amber-200";
    case "code":
      return "border-violet-400/35 bg-violet-400/10 text-violet-200";
    case "subflow":
      return "border-cyan-400/35 bg-cyan-400/10 text-cyan-200";
    case "approval":
      return "border-orange-400/35 bg-orange-400/10 text-orange-200";
    case "output":
      return "border-pink-400/35 bg-pink-400/10 text-pink-200";
  }
}

function StudioV2NodeCard({ data, selected }: NodeProps<StudioV2CanvasNode>) {
  const node = data.node;
  const isCondition = node.operation === "control.condition";

  return (
    <div
      data-testid={`studio-v2-node-${node.id}`}
      className={cn(
        "relative w-[220px] rounded-xl border bg-zinc-950/95 px-3.5 py-3 text-zinc-100 shadow-[0_16px_40px_rgba(0,0,0,0.28)] transition",
        selected
          ? "border-indigo-400 ring-4 ring-indigo-400/15"
          : "border-white/10 hover:border-white/25"
      )}
    >
      {node.kind !== "trigger" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2.5 !border-2 !border-zinc-950 !bg-zinc-400"
        />
      )}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg border",
            nodeKindTone(node.kind)
          )}
        >
          {node.kind === "code" ? (
            <BracesIcon className="size-4" />
          ) : (
            <CircleDotIcon className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{data.label}</div>
          <div className="mt-1 truncate font-mono text-[10px] text-zinc-500">{data.operation}</div>
        </div>
        <ChevronRightIcon className="mt-1 size-3.5 text-zinc-600" />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] text-zinc-500">
        <span className="capitalize">{node.kind}</span>
        <span>{node.credentialReferences?.length ?? 0} credentials</span>
      </div>
      {isCondition ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            style={{ top: "36%" }}
            className="!size-2.5 !border-2 !border-zinc-950 !bg-emerald-400"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: "72%" }}
            className="!size-2.5 !border-2 !border-zinc-950 !bg-rose-400"
          />
        </>
      ) : node.kind !== "output" ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2.5 !border-2 !border-zinc-950 !bg-indigo-400"
        />
      ) : null}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  "studio-v2": StudioV2NodeCard,
};

function nextNodeId(workflow: WorkflowDefinition, foundationId: StudioV2FoundationNodeId): string {
  const base = foundationId.replace(/_trigger$|_action$/, "");
  let index = 1;
  let candidate = base;
  const used = new Set(workflow.nodes.map((node) => node.id));
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base}_${index}`;
  }
  return candidate;
}

function WorkflowStatusBadge({
  state,
  version,
}: {
  state: "draft" | "edited" | "tested";
  version: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[11px] text-zinc-300">
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "tested" ? "bg-emerald-400" : state === "edited" ? "bg-amber-400" : "bg-zinc-500"
        )}
      />
      <span className="capitalize">{state}</span>
      <span className="text-zinc-600">v{version}</span>
    </div>
  );
}

export interface StudioV2SurfaceProps {
  initialWorkspace: StudioV2WorkspaceProjection;
  canWrite: boolean;
}

export function StudioV2Surface({ initialWorkspace, canWrite }: StudioV2SurfaceProps) {
  const fetcher = useFetcher<StudioV2WorkspaceActionData>();
  const [workflow, setWorkflow] = useState<WorkflowDefinition>(initialWorkspace.document);
  const [workspaceVersion, setWorkspaceVersion] = useState(initialWorkspace.version);
  const [testedVersion, setTestedVersion] = useState(initialWorkspace.testedVersion);
  const [lastTestSucceeded, setLastTestSucceeded] = useState(initialWorkspace.lastTestSucceeded);
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("source");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    canWrite
      ? "Durable local workspace loaded. GitHub is not required."
      : "Read-only workspace. Ask a project administrator for edit access."
  );

  const busy = fetcher.state !== "idle";
  const currentTestPassed =
    !dirty && testedVersion === workspaceVersion && lastTestSucceeded === true;
  const statusState = dirty ? "edited" : currentTestPassed ? "tested" : "draft";

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (!data.ok) {
      setStatusMessage(data.message);
      return;
    }

    setWorkflow(data.workspace.document);
    setWorkspaceVersion(data.workspace.version);
    setTestedVersion(data.workspace.testedVersion);
    setLastTestSucceeded(data.workspace.lastTestSucceeded);
    setDirty(false);

    if (data.intent === "save") {
      setStatusMessage(`Version ${data.workspace.version} saved locally. GitHub remains optional.`);
      return;
    }

    if (data.test.success) {
      setStatusMessage(`Version ${data.test.version} passed structural testing.`);
    } else {
      setStatusMessage(
        data.test.issues[0]?.message ?? `Version ${data.test.version} failed structural testing.`
      );
    }
  }, [fetcher.data]);

  const graph = useMemo(() => buildStudioV2CanvasGraph(workflow), [workflow]);
  const selectedNode = useMemo(
    () => studioV2SelectedNode(workflow, selectedNodeId),
    [workflow, selectedNodeId]
  );
  const catalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    return STUDIO_V2_FOUNDATION_NODES.filter(
      (entry) =>
        query.length === 0 ||
        entry.label.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query)
    );
  }, [catalogSearch]);

  const updateWorkflow = (updater: (current: WorkflowDefinition) => WorkflowDefinition) => {
    setWorkflow(updater);
    setDirty(true);
    setStatusMessage("Unsaved local changes. Save this revision before testing or staging.");
  };

  const saveDraft = () => {
    if (!canWrite) {
      setStatusMessage("You do not have permission to save this workspace.");
      return;
    }
    if (busy) return;
    if (!dirty) {
      setStatusMessage(`Version ${workspaceVersion} is already saved.`);
      return;
    }

    setStatusMessage("Saving the current workflow revision…");
    fetcher.submit(
      { intent: "save", expectedVersion: workspaceVersion, document: workflow },
      { method: "post", encType: "application/json" }
    );
  };

  const testWorkflow = () => {
    if (!canWrite) {
      setStatusMessage("You do not have permission to test this workspace.");
      return;
    }
    if (busy) return;
    if (dirty) {
      setStatusMessage("Save the current changes before testing this revision.");
      return;
    }

    setStatusMessage(`Structurally testing version ${workspaceVersion}…`);
    fetcher.submit(
      { intent: "test", expectedVersion: workspaceVersion },
      { method: "post", encType: "application/json" }
    );
  };

  const addNode = (foundationId: StudioV2FoundationNodeId) => {
    const foundation = STUDIO_V2_FOUNDATION_NODES.find((entry) => entry.id === foundationId)!;
    if (!foundation.availableInStudio) {
      setStatusMessage(
        `${foundation.label} still requires its Flowcordia adapter before general use.`
      );
      return;
    }
    const id = nextNodeId(workflow, foundationId);
    const node = createStudioV2FoundationNode({
      foundationId,
      id,
      position: { x: 420 + workflow.nodes.length * 36, y: 420 },
    });
    updateWorkflow((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeId(id);
  };

  const updateSource = (source: string) => {
    if (!selectedNode || selectedNode.operation !== "code.typescript") return;
    updateWorkflow((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedNode.id
          ? { ...node, configuration: { ...node.configuration, source } }
          : node
      ),
    }));
  };

  return (
    <section
      aria-label="Flowcordia Studio V2"
      className="flex h-[760px] min-h-[680px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#09090b] text-zinc-100 shadow-2xl"
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl border border-indigo-400/25 bg-indigo-400/10 text-indigo-200">
            <GitBranchIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Studio V2 workspace</div>
            <div className="mt-0.5 text-[10px] text-zinc-500">
              Durable local workflow · GitHub disconnected
            </div>
          </div>
          <WorkflowStatusBadge state={statusState} version={workspaceVersion} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveDraft}
            disabled={busy || !canWrite}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {fetcher.state !== "idle" && dirty ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={testWorkflow}
            disabled={busy || !canWrite}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-400/25 bg-indigo-400/10 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-400/15 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <PlayIcon className="size-3.5" /> Test
          </button>
          <button
            type="button"
            disabled
            title="Durable staging is implemented in the next release-state milestone."
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-300 opacity-40"
          >
            Stage
          </button>
          <button
            type="button"
            disabled
            title="Durable deployment is implemented in the next release-state milestone."
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-zinc-950 opacity-40"
          >
            <UploadCloudIcon className="size-3.5" /> Deploy
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-black/20">
          <div className="border-b border-white/10 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold">Nodes</span>
              <span className="text-[10px] text-zinc-600">{catalog.length}</span>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
              <SearchIcon className="size-3.5 text-zinc-600" />
              <input
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="Search nodes"
                className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {catalog.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => addNode(entry.id)}
                className={cn(
                  "group flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2.5 text-left transition",
                  entry.availableInStudio
                    ? "border-transparent hover:border-white/10 hover:bg-white/[0.045]"
                    : "cursor-not-allowed border-transparent opacity-45"
                )}
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400">
                  <PlusIcon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-zinc-200">
                    {entry.label}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-zinc-600">
                    {entry.availableInStudio ? entry.description : "Adapter pending"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="relative min-h-0 bg-[#0c0c0f]">
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            minZoom={0.35}
            maxZoom={1.8}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor="#6366f1" maskColor="rgba(0,0,0,0.72)" />
          </ReactFlow>
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-zinc-950/90 px-3 py-1.5 text-[10px] text-zinc-500 shadow-xl">
            {statusMessage}
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-black/20">
          <div className="border-b border-white/10 p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
              Inspector
            </div>
            {selectedNode ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <CheckCircle2Icon className="size-4 text-emerald-400" />
                  <div className="truncate text-sm font-semibold">{selectedNode.name}</div>
                </div>
                <div className="mt-1 font-mono text-[10px] text-zinc-600">
                  {selectedNode.operation}
                </div>
              </>
            ) : (
              <div className="mt-2 text-xs text-zinc-500">Select a node to configure it.</div>
            )}
          </div>

          {selectedNode && (
            <div className="space-y-5 p-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                  Node identity
                </div>
                <dl className="mt-2 space-y-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-600">ID</dt>
                    <dd className="truncate font-mono text-zinc-300">{selectedNode.id}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-600">Kind</dt>
                    <dd className="capitalize text-zinc-300">{selectedNode.kind}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-600">Credentials</dt>
                    <dd className="text-zinc-300">
                      {selectedNode.credentialReferences?.join(", ") || "None"}
                    </dd>
                  </div>
                </dl>
              </div>

              {selectedNode.operation === "code.typescript" ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                      TypeScript Source
                    </span>
                    <span className="rounded border border-violet-400/20 bg-violet-400/10 px-1.5 py-0.5 text-[9px] text-violet-300">
                      TypeScript only
                    </span>
                  </div>
                  <textarea
                    aria-label="TypeScript Source"
                    value={String(selectedNode.configuration.source ?? "")}
                    onChange={(event) => updateSource(event.target.value)}
                    disabled={!canWrite}
                    spellCheck={false}
                    className="h-64 w-full resize-none rounded-xl border border-white/10 bg-black/35 p-3 font-mono text-[11px] leading-5 text-zinc-300 outline-none focus:border-violet-400/40 disabled:opacity-60"
                  />
                  <p className="mt-2 text-[10px] leading-4 text-zinc-600">
                    The workflow stores source and credential reference names only. Runtime secret
                    values are never serialized here.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                    Configuration preview
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-3 text-[10px] leading-4 text-zinc-400">
                    {JSON.stringify(selectedNode.configuration, null, 2)}
                  </pre>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                  <GitBranchIcon className="size-3.5 text-zinc-500" /> Source control
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-zinc-600">
                  Not connected. Durable saving and testing remain available without GitHub.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
