import { unstable_usePrompt, useBeforeUnload, useFetcher } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioV2ClientWorkspaceProjection } from "../client-contract";
import type { StudioV2WorkspaceActionData, StudioV2WorkspaceCommand } from "../workspace-http";
import { StudioV2SourceWorkspace } from "./StudioV2SourceWorkspace";
import {
  STUDIO_V2_SOURCE_ENTRYPOINT,
  applyStudioV2SourceWorkspaceToDocument,
  createStudioV2SourceWorkspaceFromDocument,
  workflowSourceWorkspaceSignature,
  type WorkflowSourceLog,
  type WorkflowSourceProblem,
  type WorkflowSourceTestStatus,
  type WorkflowSourceWorkspace,
} from "./workspace-model";

const SOURCE_TEST_WARMUP_RETRY_MS = 1_500;
const SOURCE_TEST_MAX_WARMUP_ATTEMPTS = 40;

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
  readOnly = false,
  onStudioWorkspaceChange,
  onExitSource,
}: {
  studioWorkspace: StudioV2ClientWorkspaceProjection;
  readOnly?: boolean;
  onStudioWorkspaceChange(workspace: StudioV2ClientWorkspaceProjection): void;
  onExitSource?(): void;
}) {
  const workflowId = workflowIdForWorkspace(studioWorkspace);
  const initialProjection = useMemo(
    () => createStudioV2SourceWorkspaceFromDocument(studioWorkspace.document, workflowId),
    [studioWorkspace.document, workflowId]
  );
  const initialSignature = workflowSourceWorkspaceSignature(initialProjection.workspace);
  const [sourceWorkspace, setSourceWorkspaceState] = useState(initialProjection.workspace);
  const [sourceNodeId, setSourceNodeId] = useState(initialProjection.sourceNodeId);
  const [baselineSignature, setBaselineSignatureState] = useState(initialSignature);
  const [sourceConflict, setSourceConflict] = useState(false);
  const [problems, setProblems] = useState<WorkflowSourceProblem[]>([]);
  const [output, setOutput] = useState<unknown>();
  const [logs, setLogs] = useState<WorkflowSourceLog[]>([]);
  const [testStatus, setTestStatus] = useState<WorkflowSourceTestStatus>("idle");
  const [retryTestVersion, setRetryTestVersion] = useState<string>();
  const sourceWorkspaceRef = useRef(sourceWorkspace);
  const baselineSignatureRef = useRef(initialSignature);
  const pendingTestRef = useRef(false);
  const warmupAttemptsRef = useRef(0);
  const saveFetcher = useFetcher<StudioV2WorkspaceActionData>();
  const testFetcher = useFetcher<StudioV2WorkspaceActionData>();

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
  const sourceUnavailable = !sourceNodeId;

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
      workflowId
    );
    const incomingSignature = workflowSourceWorkspaceSignature(incoming.workspace);
    const currentSignature = workflowSourceWorkspaceSignature(sourceWorkspaceRef.current);
    const hasLocalEdits = currentSignature !== baselineSignatureRef.current;

    setSourceNodeId(incoming.sourceNodeId);
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
            "This Source node changed in the visual editor while local Source edits were unsaved. Reopen Source to choose the latest version before saving.",
          severity: "warning",
          file: STUDIO_V2_SOURCE_ENTRYPOINT,
        },
      ]);
    }
  }, [setBaselineSignature, setSourceWorkspace, studioWorkspace.document, workflowId]);

  const submitTest = useCallback(
    (expectedVersion: string) => {
      setTestStatus("queued");
      testFetcher.submit(
        { intent: "source_test", expectedVersion },
        { method: "post", encType: "application/json" }
      );
    },
    [testFetcher]
  );

  const beginTest = useCallback(
    (expectedVersion: string) => {
      warmupAttemptsRef.current = 0;
      setRetryTestVersion(undefined);
      setOutput(undefined);
      setProblems([]);
      setLogs([sourceLog("Preparing isolated Trigger.dev Source test.")]);
      submitTest(expectedVersion);
    },
    [submitTest]
  );

  const submitSave = useCallback(() => {
    if (sourceConflict) {
      setProblems([
        {
          message:
            "Source cannot overwrite a newer visual-editor version of the same code. Reopen Source and apply the edit again.",
          severity: "error",
          file: STUDIO_V2_SOURCE_ENTRYPOINT,
        },
      ]);
      return;
    }

    const applied = applyStudioV2SourceWorkspaceToDocument(
      studioWorkspace.document,
      sourceWorkspaceRef.current,
      sourceNodeId
    );
    if (!applied.success) {
      setProblems([
        {
          message: applied.message,
          severity: "error",
          file: STUDIO_V2_SOURCE_ENTRYPOINT,
        },
      ]);
      return;
    }

    const command: StudioV2WorkspaceCommand = {
      intent: "save",
      expectedVersion: studioWorkspace.version,
      document: applied.document,
    };
    saveFetcher.submit(command as unknown as Parameters<typeof saveFetcher.submit>[0], {
      method: "post",
      encType: "application/json",
    });
  }, [
    saveFetcher,
    sourceConflict,
    sourceNodeId,
    studioWorkspace.document,
    studioWorkspace.version,
  ]);

  const handleTest = useCallback(() => {
    if (dirty) {
      pendingTestRef.current = true;
      submitSave();
      return;
    }
    beginTest(studioWorkspace.version);
  }, [beginTest, dirty, studioWorkspace.version, submitSave]);

  useEffect(() => {
    const data = saveFetcher.data;
    if (!data) return;
    if (!data.ok) {
      pendingTestRef.current = false;
      setProblems([{ message: data.message, severity: "error" }]);
      return;
    }
    if (data.intent !== "save") return;

    const nextWorkspace = data.workspace as StudioV2ClientWorkspaceProjection;
    const nextProjection = createStudioV2SourceWorkspaceFromDocument(
      nextWorkspace.document,
      workflowIdForWorkspace(nextWorkspace)
    );
    const nextSignature = workflowSourceWorkspaceSignature(nextProjection.workspace);
    setSourceNodeId(nextProjection.sourceNodeId);
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
    saveFetcher.data,
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
      setRetryTestVersion(undefined);
      setTestStatus("error");
      setProblems([problemForSourceMessage(data.message)]);
      setLogs((current) => [...current, sourceLog(data.message, "error")]);
      return;
    }
    if (data.intent !== "source_test") return;

    const sourceTest = data.sourceTest;
    if (sourceTest.status === "warming") {
      warmupAttemptsRef.current += 1;
      if (warmupAttemptsRef.current > SOURCE_TEST_MAX_WARMUP_ATTEMPTS) {
        const message = "The isolated Source test worker did not become ready in time.";
        setRetryTestVersion(undefined);
        setTestStatus("error");
        setProblems([problemForSourceMessage(message)]);
        setLogs((current) => [...current, sourceLog(message, "error")]);
        return;
      }
      setTestStatus("queued");
      setLogs((current) => {
        const last = current.at(-1)?.message;
        return last === sourceTest.message ? current : [...current, sourceLog(sourceTest.message)];
      });
      setRetryTestVersion(studioWorkspace.version);
      return;
    }

    setRetryTestVersion(undefined);
    if (sourceTest.success === true) {
      setTestStatus("success");
      setProblems([]);
      setOutput(sourceTest.output);
      setLogs((current) => [
        ...current,
        {
          message: `Source test completed on Trigger.dev run ${sourceTest.runId}.`,
          level: "info",
          timestamp: sourceTest.updatedAt ?? new Date().toISOString(),
        },
      ]);
      return;
    }

    setTestStatus("error");
    setOutput(undefined);
    setProblems([problemForSourceMessage(sourceTest.message)]);
    setLogs((current) => [
      ...current,
      {
        message: `Trigger.dev run ${sourceTest.runId}: ${sourceTest.message}`,
        level: "error",
        timestamp: sourceTest.updatedAt ?? new Date().toISOString(),
      },
    ]);
  }, [studioWorkspace.version, testFetcher.data]);

  useEffect(() => {
    if (!retryTestVersion) return;
    const timeout = window.setTimeout(() => {
      setRetryTestVersion(undefined);
      submitTest(retryTestVersion);
    }, SOURCE_TEST_WARMUP_RETRY_MS);
    return () => window.clearTimeout(timeout);
  }, [retryTestVersion, submitTest]);

  const initialProblems = sourceUnavailable
    ? [
        {
          message:
            "This workflow does not contain a TypeScript Source node yet. Add one in Editor before editing Source.",
          severity: "info" as const,
        },
      ]
    : problems;

  return (
    <div
      data-testid="flowcordia-studio-v2-source-surface"
      data-workflow-source-draft={workflowId}
      data-source-persistence="durable-local"
      data-source-test-runtime="trigger-dev-secure-exec"
      className="h-full min-h-0 min-w-0 overflow-hidden"
    >
      <StudioV2SourceWorkspace
        workspace={sourceWorkspace}
        readOnly={readOnly || sourceUnavailable}
        onWorkspaceChange={setSourceWorkspace}
        onExitSource={onExitSource}
        onSave={readOnly || sourceUnavailable ? undefined : submitSave}
        saving={saving}
        onTest={readOnly || sourceUnavailable ? undefined : handleTest}
        testStatus={testStatus}
        output={output}
        logs={logs}
        problems={initialProblems}
      />
    </div>
  );
}
