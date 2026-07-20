import { findInlineSecretPath, type JsonObject, type JsonValue } from "@flowcordia/workflow";
import { AlertTriangleIcon, CheckCircle2Icon, FlaskConicalIcon, RadioIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import type { WorkflowFunctionCatalogProjection } from "../functions/presentation";
import type { FlowcordiaPreviewProjection } from "../preview/presentation";
import {
  createWorkflowFunctionTestPayload,
  validateWorkflowFunctionTestPayload,
} from "./function-test-input";
import { WorkflowFunctionInputForm } from "./WorkflowFunctionInputForm";
import type { WorkflowStudioGraph, WorkflowStudioNode } from "./presentation";

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400";

type TestMode = "structural" | "live";
type InputMode = "form" | "json";

export interface WorkflowFunctionTestResult {
  success: boolean;
  output?: unknown;
  traces: Array<{
    nodeId: string;
    operation: string;
    status: "SUCCEEDED" | "SKIPPED" | "FAILED";
    message?: string;
  }>;
}

function entryFunctionNodes(graph: WorkflowStudioGraph): WorkflowStudioNode[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes.filter((node) => {
    if (node.ownership !== "developer" || !node.inputSchema) return false;
    const incoming = graph.edges.filter((edge) => edge.target === node.id);
    return (
      incoming.length === 0 || incoming.every((edge) => nodes.get(edge.source)?.kind === "trigger")
    );
  });
}

function parseJsonPayload(value: string): { value?: JsonValue; error?: string } {
  try {
    return { value: JSON.parse(value) as JsonValue };
  } catch {
    return { error: "Payload must be valid JSON." };
  }
}

function sessionKey(repositoryKey: string, workflowId: string, nodeId: string): string {
  return `flowcordia:function-test:${repositoryKey}:${workflowId}:${nodeId}`;
}

function outputText(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return "null";
  }
}

export function WorkflowFunctionTestPanel({
  graph,
  preview,
  functionCatalog,
  repositoryKey,
  structuralBusy,
  liveBusy,
  canRunStructural,
  canRunLive,
  lastTest,
  onRunStructural,
  onRunLive,
}: {
  graph: WorkflowStudioGraph;
  preview: FlowcordiaPreviewProjection;
  functionCatalog: WorkflowFunctionCatalogProjection;
  repositoryKey: string;
  structuralBusy: boolean;
  liveBusy: boolean;
  canRunStructural: boolean;
  canRunLive: boolean;
  lastTest: WorkflowFunctionTestResult | null;
  onRunStructural: (
    payload: JsonValue,
    fixture: { nodeId: string; fixtureId: string } | null
  ) => void;
  onRunLive: (payload: JsonValue) => void;
}) {
  const functions = useMemo(() => entryFunctionNodes(graph), [graph]);
  const [functionNodeId, setFunctionNodeId] = useState(functions[0]?.id ?? "");
  const [mode, setMode] = useState<TestMode>("structural");
  const [inputMode, setInputMode] = useState<InputMode>(functions.length > 0 ? "form" : "json");
  const selectedFunction =
    functions.find((node) => node.id === functionNodeId) ?? functions[0] ?? null;
  const schema = selectedFunction?.inputSchema ?? null;
  const selectedCatalogFunction = selectedFunction?.codeReference
    ? (functionCatalog.functions.find(
        (definition) =>
          definition.id === selectedFunction.functionId &&
          definition.codePath === selectedFunction.codeReference?.path &&
          definition.exportName === selectedFunction.codeReference?.exportName
      ) ?? null)
    : null;
  const fixtures = selectedCatalogFunction?.fixtures ?? [];
  const [fixtureId, setFixtureId] = useState("");
  const [payload, setPayload] = useState<JsonValue>(() =>
    schema ? createWorkflowFunctionTestPayload(schema) : {}
  );
  const [rawPayload, setRawPayload] = useState(() => outputText(payload));
  const [rawError, setRawError] = useState<string | null>(null);
  const issues = schema ? validateWorkflowFunctionTestPayload(schema, payload) : [];
  const sensitivePath = findInlineSecretPath(payload);
  const busy = structuralBusy || liveBusy;
  const liveReady = preview.state === "READY" && canRunLive;

  useEffect(() => {
    if (functions.some((node) => node.id === functionNodeId)) return;
    setFunctionNodeId(functions[0]?.id ?? "");
    if (functions.length === 0) setInputMode("json");
  }, [functionNodeId, functions]);

  useEffect(() => {
    setFixtureId("");
  }, [selectedFunction?.id]);

  useEffect(() => {
    if (!selectedFunction?.inputSchema) {
      setPayload({});
      setRawPayload("{}");
      setRawError(null);
      return;
    }
    const fallback = createWorkflowFunctionTestPayload(selectedFunction.inputSchema);
    let next = fallback;
    try {
      const stored = window.sessionStorage.getItem(
        sessionKey(repositoryKey, graph.workflowId, selectedFunction.id)
      );
      if (stored) {
        const parsed = JSON.parse(stored) as JsonValue;
        if (
          validateWorkflowFunctionTestPayload(selectedFunction.inputSchema, parsed).length === 0 &&
          findInlineSecretPath(parsed) === null
        ) {
          next = parsed;
        }
      }
    } catch {
      // Session-only convenience must never block Studio.
    }
    setPayload(next);
    setRawPayload(outputText(next));
    setRawError(null);
  }, [graph.workflowId, repositoryKey, selectedFunction?.id, selectedFunction?.inputSchema]);

  useEffect(() => {
    if (!selectedFunction || issues.length > 0 || sensitivePath) return;
    try {
      window.sessionStorage.setItem(
        sessionKey(repositoryKey, graph.workflowId, selectedFunction.id),
        JSON.stringify(payload)
      );
    } catch {
      // Inputs remain usable even when storage is unavailable.
    }
  }, [graph.workflowId, issues.length, payload, repositoryKey, selectedFunction, sensitivePath]);

  const updatePayload = (next: JsonValue) => {
    setFixtureId("");
    setPayload(next);
    setRawPayload(outputText(next));
    setRawError(null);
  };

  const applyFixture = (nextFixtureId: string) => {
    setFixtureId(nextFixtureId);
    const fixture = fixtures.find((candidate) => candidate.id === nextFixtureId);
    if (!fixture) return;
    const next = JSON.parse(JSON.stringify(fixture.input)) as JsonValue;
    setPayload(next);
    setRawPayload(outputText(next));
    setRawError(null);
    setInputMode("form");
  };

  const resolvedPayload = (): JsonValue | null => {
    if (inputMode === "form" && schema) {
      if (issues.length > 0) return null;
      return payload;
    }
    const parsed = parseJsonPayload(rawPayload);
    if (parsed.error || parsed.value === undefined) {
      setRawError(parsed.error ?? "Payload is required.");
      return null;
    }
    if (schema) {
      const nextIssues = validateWorkflowFunctionTestPayload(schema, parsed.value);
      if (nextIssues.length > 0) {
        setRawError(`${nextIssues[0]!.displayPath}: ${nextIssues[0]!.message}`);
        return null;
      }
    }
    setPayload(parsed.value);
    setRawError(null);
    return parsed.value;
  };

  const run = () => {
    const next = resolvedPayload();
    if (next === null) return;
    if (mode === "structural") {
      onRunStructural(
        next,
        fixtureId && selectedFunction ? { nodeId: selectedFunction.id, fixtureId } : null
      );
    } else {
      onRunLive(next);
    }
  };

  return (
    <section
      data-testid="flowcordia-testing-panel"
      data-mode={mode}
      className="border-b border-grid-bright bg-background-dimmed px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConicalIcon className="size-4 text-indigo-300" />
            <h3 className="text-sm font-medium text-text-bright">Function testing</h3>
          </div>
          <p className="mt-1 max-w-2xl text-xxs leading-4 text-text-dimmed">
            Valid non-sensitive inputs are remembered only for this browser tab. Test payloads are
            never written to the workflow, proposal, Git repository, or Flowcordia database.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded border border-grid-bright bg-background-bright p-1">
          <button
            type="button"
            className={cn(
              "rounded px-2.5 py-1.5 text-xxs font-medium transition",
              mode === "structural"
                ? "bg-indigo-500/15 text-indigo-200"
                : "text-text-dimmed hover:text-text-bright"
            )}
            data-testid="flowcordia-testing-mode-structural"
            onClick={() => setMode("structural")}
          >
            Structural preview
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2.5 py-1.5 text-xxs font-medium transition",
              mode === "live"
                ? "bg-emerald-500/15 text-emerald-200"
                : "text-text-dimmed hover:text-text-bright"
            )}
            data-testid="flowcordia-testing-mode-live"
            onClick={() => setMode("live")}
          >
            Live preview
          </button>
        </div>
      </div>

      {functions.length === 0 && (
        <div className="mt-3 rounded border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-xs leading-5 text-yellow-200">
          No repository function currently receives the workflow payload directly. Advanced JSON
          remains available for whole-workflow structural or live testing.
        </div>
      )}

      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="space-y-3">
          <div className={cn("grid gap-3", functions.length > 0 && "lg:grid-cols-3")}>
            {functions.length > 0 && (
              <label>
                <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                  Entry function
                </span>
                <select
                  className={inputClassName}
                  value={selectedFunction?.id ?? ""}
                  disabled={busy}
                  onChange={(event) => setFunctionNodeId(event.target.value)}
                >
                  {functions.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {fixtures.length > 0 && (
              <label>
                <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                  Repository fixture
                </span>
                <select
                  className={inputClassName}
                  value={fixtureId}
                  disabled={busy}
                  onChange={(event) => applyFixture(event.target.value)}
                >
                  <option value="">Custom input</option>
                  {fixtures.map((fixture) => (
                    <option key={fixture.id} value={fixture.id}>
                      {fixture.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div>
              <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                Input editor
              </span>
              <div className="flex h-9 items-center gap-1 rounded border border-grid-bright bg-background-bright p-1">
                {schema && (
                  <button
                    type="button"
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-xxs transition",
                      inputMode === "form" ? "bg-indigo-500/15 text-indigo-200" : "text-text-dimmed"
                    )}
                    onClick={() => setInputMode("form")}
                  >
                    Schema form
                  </button>
                )}
                <button
                  type="button"
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-xxs transition",
                    inputMode === "json" ? "bg-indigo-500/15 text-indigo-200" : "text-text-dimmed"
                  )}
                  data-testid="flowcordia-testing-input-json"
                  onClick={() => setInputMode("json")}
                >
                  Advanced JSON
                </button>
              </div>
            </div>
          </div>

          {schema && inputMode === "form" ? (
            <WorkflowFunctionInputForm
              schema={schema}
              value={payload}
              issues={issues}
              disabled={busy}
              onChange={updatePayload}
            />
          ) : (
            <div>
              <textarea
                aria-label="Function test payload JSON"
                data-testid="flowcordia-testing-payload"
                className={cn(inputClassName, "min-h-52 resize-y font-mono")}
                value={rawPayload}
                disabled={busy}
                onChange={(event) => {
                  setFixtureId("");
                  setRawPayload(event.target.value);
                  setRawError(null);
                }}
              />
              {rawError && <div className="mt-2 text-xxs text-rose-300">{rawError}</div>}
            </div>
          )}

          {issues.length > 0 && inputMode === "form" && (
            <div className="rounded border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xxs text-rose-200">
              {issues.length} input contract issue{issues.length === 1 ? "" : "s"}. Correct the
              highlighted fields before running.
            </div>
          )}

          {sensitivePath && (
            <div className="rounded border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xxs text-yellow-200">
              Sensitive-looking value at {sensitivePath.join(".")} will be used for this run but
              will not be remembered in browser storage.
            </div>
          )}

          {fixtureId && mode === "structural" && (
            <div className="rounded border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xxs leading-4 text-indigo-200">
              Structural Preview will use the repository-owned mock output for this exact fixture.
              Live Preview always executes the exact deployed proposal instead.
            </div>
          )}

          {mode === "live" && !liveReady && (
            <div className="rounded border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xxs leading-4 text-yellow-200">
              {preview.state === "READY" ? "Your role cannot start preview runs." : preview.message}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              data-testid="flowcordia-testing-run"
              variant={mode === "live" ? "primary/small" : "secondary/small"}
              LeadingIcon={mode === "live" ? RadioIcon : FlaskConicalIcon}
              disabled={
                busy ||
                (inputMode === "form" && issues.length > 0) ||
                (mode === "structural" ? !canRunStructural : !liveReady)
              }
              isLoading={mode === "structural" ? structuralBusy : liveBusy}
              onClick={run}
            >
              {mode === "structural" ? "Run structural preview" : "Run live preview"}
            </Button>
            <Badge
              className={cn(
                "border",
                mode === "structural"
                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              )}
            >
              {mode === "structural" ? "No customer code" : "Exact deployed proposal"}
            </Badge>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded border border-grid-dimmed bg-background-bright p-3">
            <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
              {lastTest ? "Latest structural result" : "Output"}
            </div>
            {lastTest ? (
              <>
                <div
                  data-testid="flowcordia-structural-result"
                  data-status={lastTest.success ? "PASSED" : "FAILED"}
                  className="mt-2 flex items-center gap-2"
                >
                  {lastTest.success ? (
                    <CheckCircle2Icon className="size-4 text-emerald-300" />
                  ) : (
                    <AlertTriangleIcon className="size-4 text-rose-300" />
                  )}
                  <span
                    className={
                      lastTest.success ? "text-xs text-emerald-200" : "text-xs text-rose-200"
                    }
                  >
                    {lastTest.success ? "Structural preview passed" : "Structural preview failed"}
                  </span>
                </div>
                <pre className="mt-3 max-h-64 overflow-auto rounded border border-grid-dimmed bg-background-dimmed p-3 font-mono text-xxs leading-5 text-text-bright">
                  {outputText(lastTest.output)}
                </pre>
              </>
            ) : (
              <p className="mt-2 text-xs leading-5 text-text-dimmed">
                Run a structural preview to inspect the workflow output. Live preview node state is
                projected on the canvas and remains tied to the exact proposal deployment.
              </p>
            )}
          </div>

          {lastTest && (
            <div className="rounded border border-grid-dimmed bg-background-bright p-3">
              <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                Trace and contract diagnostics
              </div>
              <div className="mt-2 space-y-2">
                {lastTest.traces.map((trace) => (
                  <div
                    key={`${trace.nodeId}:${trace.operation}`}
                    className={cn(
                      "rounded border px-2.5 py-2 text-xxs",
                      trace.status === "SUCCEEDED"
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
                        : trace.status === "SKIPPED"
                          ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-200"
                          : "border-rose-500/20 bg-rose-500/5 text-rose-200"
                    )}
                  >
                    <div className="font-mono">
                      {trace.nodeId}: {trace.status.toLowerCase()}
                    </div>
                    {trace.message && <div className="mt-1 leading-4">{trace.message}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
