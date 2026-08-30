import { unstable_usePrompt, useBeforeUnload, useFetcher, useRevalidator } from "@remix-run/react";
import type { JsonValue, WorkflowSourceProject } from "@flowcordia/workflow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioV2ClientWorkspaceProjection } from "../client-contract";
import type { StudioV2WorkspaceActionData, StudioV2WorkspaceCommand } from "../workspace-http";
import { StudioV2SourceWorkspace } from "./StudioV2SourceWorkspace";
import {
  STUDIO_V2_SOURCE_ENTRYPOINT,
  createStudioV2SourceWorkspaceFromDocument,
  workflowSourceText,
  workflowSourceProject,
  workflowSourceWorkspaceSignature,
  type WorkflowSourceLog,
  type WorkflowSourceProblem,
  type WorkflowSourceTestStatus,
  type WorkflowSourceWorkspace,
  type StudioV2GeneratedWorkflowSource,
} from "./workspace-model";

const DEFAULT_SOURCE_TEST_INPUT = `{
  "requestId": "source-preview"
}\n`;
const WORKFLOW_TEST_RETRY_MS = 1_500;
const WORKFLOW_TEST_POLL_MS = 1_000;
const WORKFLOW_TEST_MAX_WARMUP_ATTEMPTS = 80;

function sourceDraftStorageKey(workspacePublicId: string): string {
  return `flowcordia:studio-v2:source-draft:${workspacePublicId}`;
}

function isStoredSourceWorkspace(value: unknown): value is WorkflowSourceWorkspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const workspace = value as Partial<WorkflowSourceWorkspace>;
  return (
    typeof workspace.entrypoint === "string" &&
    !!workspace.files &&
    typeof workspace.files === "object" &&
    !Array.isArray(workspace.files) &&
    !!workspace.dependencies &&
    typeof workspace.dependencies === "object" &&
    !Array.isArray(workspace.dependencies) &&
    Array.isArray(workspace.credentialReferences)
  );
}

function workflowIdForWorkspace(workspace: StudioV2ClientWorkspaceProjection): string {
  const id = workspace.document.id;
  return typeof id === "string" && id.length > 0 ? id : workspace.publicId;
}

function problemForSourceMessage(message: string): WorkflowSourceProblem {
  const location = message.match(/\bat line\s+(\d+)(?::(\d+))?/i);
  return {
    message,
    severity: "error",
    file: STUDIO_V2_SOURCE_ENTRYPOINT,
    ...(location
      ? {
          line: Number(location[1]),
          column: location[2] ? Number(location[2]) : 1,
        }
      : {}),
  };
}

function sourceLog(message: string, level: WorkflowSourceLog["level"] = "info"): WorkflowSourceLog {
  return { message, level, timestamp: new Date().toISOString() };
}

export function StudioV2SourceSurface({
  studioWorkspace,
  generatedSource,
  readOnly = false,
  onStudioWorkspaceChange,
  onExitSource,
  onExitStudio,
}: {
  studioWorkspace: StudioV2ClientWorkspaceProjection;
  generatedSource?: StudioV2GeneratedWorkflowSource | null;
  readOnly?: boolean;
  onStudioWorkspaceChange(workspace: StudioV2ClientWorkspaceProjection): void;
  onExitSource?(): void;
  onExitStudio?(): void;
}) {
  const workflowId = workflowIdForWorkspace(studioWorkspace);
  const currentGeneratedSource =
    generatedSource?.documentSha256 === studioWorkspace.documentSha256
      ? generatedSource
      : undefined;
  const initialProjection = useMemo(
    () =>
      createStudioV2SourceWorkspaceFromDocument(
        studioWorkspace.document,
        workflowId,
        currentGeneratedSource
      ),
    [currentGeneratedSource, studioWorkspace.document, workflowId]
  );
  const initialSignature = workflowSourceWorkspaceSignature(initialProjection.workspace);
  const [sourceWorkspace, setSourceWorkspaceState] = useState(initialProjection.workspace);
  const [baselineSignature, setBaselineSignatureState] = useState(initialSignature);
  const [sourceConflict, setSourceConflict] = useState(false);
  const [problems, setProblems] = useState<WorkflowSourceProblem[]>([]);
  const [output, setOutput] = useState<unknown>();
  const [logs, setLogs] = useState<WorkflowSourceLog[]>([]);
  const [testStatus, setTestStatus] = useState<WorkflowSourceTestStatus>("idle");
  const [testInput, setTestInput] = useState(DEFAULT_SOURCE_TEST_INPUT);
  const [testRunId, setTestRunId] = useState<string>();
  const [testWarming, setTestWarming] = useState(false);
  const warmupAttemptsRef = useRef(0);
  const sourceWorkspaceRef = useRef(sourceWorkspace);
  const baselineSignatureRef = useRef(initialSignature);
  const pendingTestRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const saveFetcher = useFetcher<StudioV2WorkspaceActionData>();
  const testFetcher = useFetcher<StudioV2WorkspaceActionData>();
  const revalidator = useRevalidator();

  const setSourceWorkspace = useCallback((workspace: WorkflowSourceWorkspace) => {
    sourceWorkspaceRef.current = workspace;
    setSourceWorkspaceState(workspace);
  }, []);

  const setBaselineSignature = useCallback((signature: string) => {
    baselineSignatureRef.current = signature;
    setBaselineSignatureState(signature);
  }, []);

  const dirty = workflowSourceWorkspaceSignature(sourceWorkspace) !== baselineSignature;
  const saving = saveFetcher.state !== "idle";

  useEffect(() => {
    draftHydratedRef.current = false;
    try {
      const stored = window.localStorage.getItem(sourceDraftStorageKey(studioWorkspace.publicId));
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        schemaVersion?: unknown;
        workspaceVersion?: unknown;
        workspace?: unknown;
        testInput?: unknown;
      };
      if (parsed.schemaVersion !== 1 || !isStoredSourceWorkspace(parsed.workspace)) return;
      const recovered = parsed.workspace;
      if (workflowSourceWorkspaceSignature(recovered) === baselineSignatureRef.current) return;
      setSourceWorkspace(recovered);
      if (typeof parsed.testInput === "string") setTestInput(parsed.testInput);
      const stale = parsed.workspaceVersion !== studioWorkspace.version;
      setSourceConflict(stale);
      setProblems([
        {
          message: stale
            ? "Recovered Source changes were based on an older workspace version. Review the draft before choosing which version to keep."
            : "Recovered unsaved Source changes from this browser.",
          severity: "warning",
          file: STUDIO_V2_SOURCE_ENTRYPOINT,
        },
      ]);
    } catch {
      window.localStorage.removeItem(sourceDraftStorageKey(studioWorkspace.publicId));
    } finally {
      draftHydratedRef.current = true;
    }
  }, [setSourceWorkspace, studioWorkspace.publicId, studioWorkspace.version]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const key = sourceDraftStorageKey(studioWorkspace.publicId);
    try {
      if (!dirty) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(
        key,
        JSON.stringify({
          schemaVersion: 1,
          workspaceVersion: studioWorkspace.version,
          workspace: sourceWorkspace,
          testInput,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Browser storage is best-effort; server persistence remains authoritative.
    }
  }, [dirty, sourceWorkspace, studioWorkspace.publicId, studioWorkspace.version, testInput]);

  unstable_usePrompt({
    message: "You have unsaved Source changes. Leave without saving?",
    when: ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  });

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!dirty) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [dirty]
    )
  );

  useEffect(() => {
    const incoming = createStudioV2SourceWorkspaceFromDocument(
      studioWorkspace.document,
      workflowId,
      currentGeneratedSource
    );
    const incomingSignature = workflowSourceWorkspaceSignature(incoming.workspace);
    const currentSignature = workflowSourceWorkspaceSignature(sourceWorkspaceRef.current);
    const hasLocalEdits = currentSignature !== baselineSignatureRef.current;

    if (!hasLocalEdits) {
      setSourceWorkspace(incoming.workspace);
      setBaselineSignature(incomingSignature);
      setSourceConflict(false);
      return;
    }

    if (incomingSignature !== baselineSignatureRef.current) {
      setSourceConflict(true);
      setProblems([
        {
          message:
            "This workflow changed in Editor while your Source draft was unsaved. Choose which version to continue with.",
          severity: "warning",
          file: STUDIO_V2_SOURCE_ENTRYPOINT,
        },
      ]);
    }
  }, [
    currentGeneratedSource,
    setBaselineSignature,
    setSourceWorkspace,
    studioWorkspace.document,
    workflowId,
  ]);

  const submitTest = useCallback(
    (expectedVersion: string, retryFailedDeployment: boolean) => {
      let input: JsonValue;
      try {
        input = testInput.trim() ? (JSON.parse(testInput) as JsonValue) : null;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Test input must be valid JSON.";
        setTestStatus("error");
        setProblems([{ message, severity: "error" }]);
        setLogs((current) => [...current, sourceLog(message, "error")]);
        return;
      }
      setTestStatus("queued");
      testFetcher.submit(
        { intent: "source_test", expectedVersion, input, retryFailedDeployment },
        { method: "post", encType: "application/json" }
      );
    },
    [testFetcher, testInput]
  );

  const beginTest = useCallback(
    (expectedVersion: string) => {
      warmupAttemptsRef.current = 0;
      setTestRunId(undefined);
      setTestWarming(false);
      setOutput(undefined);
      setProblems([]);
      setLogs([sourceLog("Running the saved workflow through the Flowcordia test runtime.")]);
      submitTest(expectedVersion, true);
    },
    [submitTest]
  );

  const submitSave = useCallback(() => {
    if (sourceConflict) {
      pendingTestRef.current = false;
      setProblems([
        {
          message: "Resolve the Source conflict before saving or testing this draft.",
          severity: "error",
          file: STUDIO_V2_SOURCE_ENTRYPOINT,
        },
      ]);
      return;
    }

    const source = workflowSourceText(sourceWorkspaceRef.current);
    if (!source) {
      setProblems([
        {
          message: "The Source entrypoint must contain an executable workflow before saving.",
          severity: "error",
          file: STUDIO_V2_SOURCE_ENTRYPOINT,
        },
      ]);
      return;
    }

    let sourceProject: WorkflowSourceProject;
    try {
      sourceProject = workflowSourceProject(sourceWorkspaceRef.current);
    } catch (error) {
      setProblems([
        {
          message: error instanceof Error ? error.message : "The Source project is invalid.",
          severity: "error",
        },
      ]);
      return;
    }
    const command: StudioV2WorkspaceCommand = {
      intent: "source_save",
      expectedVersion: studioWorkspace.version,
      sourceProject,
    };
    saveFetcher.submit(command as unknown as Parameters<typeof saveFetcher.submit>[0], {
      method: "post",
      encType: "application/json",
    });
  }, [saveFetcher, sourceConflict, studioWorkspace.version]);

  const reloadLatestSource = useCallback(() => {
    const latest = createStudioV2SourceWorkspaceFromDocument(
      studioWorkspace.document,
      workflowId,
      currentGeneratedSource
    );
    const latestSignature = workflowSourceWorkspaceSignature(latest.workspace);
    pendingTestRef.current = false;
    setSourceWorkspace(latest.workspace);
    setBaselineSignature(latestSignature);
    setSourceConflict(false);
    setProblems([]);
    setOutput(undefined);
    setLogs([]);
    setTestStatus("idle");
  }, [
    currentGeneratedSource,
    setBaselineSignature,
    setSourceWorkspace,
    studioWorkspace.document,
    workflowId,
  ]);

  const keepLocalSourceDraft = useCallback(() => {
    const latest = createStudioV2SourceWorkspaceFromDocument(
      studioWorkspace.document,
      workflowId,
      currentGeneratedSource
    );
    pendingTestRef.current = false;
    setBaselineSignature(workflowSourceWorkspaceSignature(latest.workspace));
    setSourceConflict(false);
    setProblems([]);
  }, [currentGeneratedSource, setBaselineSignature, studioWorkspace.document, workflowId]);

  const handleTest = useCallback(() => {
    if (dirty) {
      pendingTestRef.current = true;
      submitSave();
      return;
    }
    beginTest(studioWorkspace.version);
  }, [beginTest, dirty, studioWorkspace.version, submitSave]);

  const handleCancelTest = useCallback(() => {
    if (!testRunId) return;
    testFetcher.submit(
      { intent: "cancel_test", expectedVersion: studioWorkspace.version, runId: testRunId },
      { method: "post", encType: "application/json" }
    );
  }, [studioWorkspace.version, testFetcher, testRunId]);

  useEffect(() => {
    const data = saveFetcher.data;
    if (!data) return;
    if (!data.ok) {
      pendingTestRef.current = false;
      setProblems([{ message: data.message, severity: "error" }]);
      if (data.code === "workspace_conflict") {
        setSourceConflict(true);
        revalidator.revalidate();
      }
      return;
    }
    if (data.intent !== "save" && data.intent !== "source_save") return;

    const nextWorkspace = data.workspace as StudioV2ClientWorkspaceProjection;
    const nextProjection = createStudioV2SourceWorkspaceFromDocument(
      nextWorkspace.document,
      workflowIdForWorkspace(nextWorkspace),
      generatedSource?.documentSha256 === nextWorkspace.documentSha256 ? generatedSource : undefined
    );
    const nextSignature = workflowSourceWorkspaceSignature(nextProjection.workspace);
    setSourceWorkspace(nextProjection.workspace);
    setBaselineSignature(nextSignature);
    setSourceConflict(false);
    setProblems([]);
    onStudioWorkspaceChange(nextWorkspace);

    if (pendingTestRef.current) {
      pendingTestRef.current = false;
      beginTest(nextWorkspace.version);
    }
  }, [
    beginTest,
    onStudioWorkspaceChange,
    revalidator,
    saveFetcher.data,
    generatedSource,
    setBaselineSignature,
    setSourceWorkspace,
  ]);

  useEffect(() => {
    if (testFetcher.state !== "idle") setTestStatus("running");
  }, [testFetcher.state]);

  useEffect(() => {
    const data = testFetcher.data;
    if (!data) return;
    if (!data.ok) {
      setTestRunId(undefined);
      setTestWarming(false);
      setTestStatus("error");
      setProblems([problemForSourceMessage(data.message)]);
      setLogs((current) => [...current, sourceLog(data.message, "error")]);
      return;
    }
    if (data.intent === "cancel_test") {
      setTestWarming(false);
      setTestStatus("running");
      setLogs((current) => [...current, sourceLog(`Cancellation requested for ${data.runId}.`)]);
      return;
    }
    if (data.intent === "source_test") {
      const sourceTest = data.sourceTest;
      if (sourceTest.status === "warming") {
        const message = sourceTest.message;
        setTestWarming(true);
        setTestStatus("queued");
        setLogs((current) => {
          const last = current.at(-1)?.message;
          return last === message ? current : [...current, sourceLog(message)];
        });
        return;
      }

      setTestWarming(false);
      setTestRunId(undefined);
      if ("output" in sourceTest) {
        setTestStatus("success");
        setProblems([]);
        setOutput(sourceTest.output);
        setLogs((current) => [...current, sourceLog(`Source test ${sourceTest.runId} completed.`)]);
      } else if ("message" in sourceTest) {
        setTestStatus("error");
        setOutput(undefined);
        setProblems([problemForSourceMessage(sourceTest.message)]);
        setLogs((current) => [...current, sourceLog(sourceTest.message, "error")]);
      }
      return;
    }

    if (data.intent !== "test") return;

    if (data.test.status === "warming") {
      const message = data.test.message;
      setTestWarming(true);
      setTestStatus("queued");
      setLogs((current) => {
        const last = current.at(-1)?.message;
        return last === message ? current : [...current, sourceLog(message)];
      });
      return;
    }
    if (data.test.status === "running") {
      const message = data.test.message;
      setTestWarming(false);
      setTestRunId(data.test.runId);
      setTestStatus("running");
      setLogs((current) => [...current, sourceLog(message)]);
      return;
    }

    setTestRunId(undefined);
    setTestWarming(false);
    if (data.workspace) {
      onStudioWorkspaceChange(data.workspace as StudioV2ClientWorkspaceProjection);
    }
    const execution = data.test.execution;
    const traceLogs: WorkflowSourceLog[] =
      execution?.traces.map((trace) => ({
        message: `${trace.nodeId} ${trace.status.toLowerCase()} (${trace.durationMs} ms)${
          trace.message ? `: ${trace.message}` : ""
        }`,
        level:
          trace.status === "FAILED" || trace.status === "CANCELLED"
            ? ("error" as const)
            : ("info" as const),
        timestamp: trace.completedAt,
      })) ?? [];
    setLogs((current) => [...current, ...traceLogs]);

    if (data.test.success && execution.success) {
      setTestStatus("success");
      setProblems([]);
      setOutput({ runId: data.test.runId, output: execution.output, traces: execution.traces });
      return;
    }

    const failedTrace = execution.traces.find(
      (trace) => trace.status === "FAILED" || trace.status === "CANCELLED"
    );
    const message = failedTrace?.message ?? `Run ${data.test.runId} failed.`;
    setTestStatus("error");
    setOutput(undefined);
    setProblems([problemForSourceMessage(message)]);
  }, [onStudioWorkspaceChange, testFetcher.data]);

  useEffect(() => {
    if (!testWarming || testFetcher.state !== "idle") return;
    if (warmupAttemptsRef.current >= WORKFLOW_TEST_MAX_WARMUP_ATTEMPTS) {
      setTestWarming(false);
      setTestStatus("error");
      const message = "The exact workflow test worker did not become ready in time.";
      setProblems([problemForSourceMessage(message)]);
      setLogs((current) => [...current, sourceLog(message, "error")]);
      return;
    }
    const timeout = window.setTimeout(() => {
      warmupAttemptsRef.current += 1;
      submitTest(studioWorkspace.version, false);
    }, WORKFLOW_TEST_RETRY_MS);
    return () => window.clearTimeout(timeout);
  }, [studioWorkspace.version, submitTest, testFetcher.state, testWarming]);

  useEffect(() => {
    if (!testRunId || testFetcher.state !== "idle") return;
    const timeout = window.setTimeout(
      () =>
        testFetcher.submit(
          { intent: "test_status", expectedVersion: studioWorkspace.version, runId: testRunId },
          { method: "post", encType: "application/json" }
        ),
      WORKFLOW_TEST_POLL_MS
    );
    return () => window.clearTimeout(timeout);
  }, [studioWorkspace.version, testFetcher, testFetcher.state, testRunId]);

  const compilerProblems: WorkflowSourceProblem[] = currentGeneratedSource
    ? [
        ...currentGeneratedSource.issues.map((issue) => ({
          message: issue.nodeId ? `${issue.nodeId}: ${issue.message}` : issue.message,
          severity: "error" as const,
          file: currentGeneratedSource.path,
        })),
        ...currentGeneratedSource.warnings.map((message) => ({
          message,
          severity: "info" as const,
          file: currentGeneratedSource.path,
        })),
      ]
    : [];
  const visibleProblems = [...compilerProblems, ...problems];

  return (
    <div
      data-testid="flowcordia-studio-v2-source-surface"
      data-workflow-source-draft={workflowId}
      data-source-persistence="durable-local"
      data-source-test-runtime="trigger-worker-project"
      className="h-full min-h-0 min-w-0 overflow-hidden"
    >
      <StudioV2SourceWorkspace
        workspace={sourceWorkspace}
        readOnly={readOnly}
        dirty={dirty}
        testInput={testInput}
        onWorkspaceChange={setSourceWorkspace}
        onTestInputChange={setTestInput}
        onExitSource={onExitSource}
        onExitStudio={onExitStudio}
        onSave={readOnly ? undefined : submitSave}
        saving={saving}
        onTest={readOnly ? undefined : handleTest}
        onCancelTest={testRunId ? handleCancelTest : undefined}
        testStatus={testStatus}
        output={output}
        logs={logs}
        problems={visibleProblems}
        conflict={
          sourceConflict
            ? {
                message:
                  "Editor has a newer workflow version. Reload it, or keep your draft and save it over the latest workflow.",
                onReloadLatest: reloadLatestSource,
                onKeepLocalDraft: keepLocalSourceDraft,
              }
            : undefined
        }
      />
    </div>
  );
}
