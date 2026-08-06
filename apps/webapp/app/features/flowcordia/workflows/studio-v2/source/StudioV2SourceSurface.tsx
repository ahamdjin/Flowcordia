import { useFetcher } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioV2ClientWorkspaceProjection } from "../client-contract";
import type { StudioV2WorkspaceActionData } from "../workspace-http";
import { StudioV2SourceWorkspace } from "./StudioV2SourceWorkspace";
import {
  STUDIO_V2_SOURCE_ENTRYPOINT,
  applyStudioV2SourceWorkspaceToDocument,
  createStudioV2SourceWorkspaceFromDocument,
  workflowSourceWorkspaceSignature,
  type WorkflowSourceProblem,
  type WorkflowSourceTestStatus,
  type WorkflowSourceWorkspace,
} from "./workspace-model";

function workflowIdForWorkspace(workspace: StudioV2ClientWorkspaceProjection): string {
  const id = workspace.document.id;
  return typeof id === "string" && id.length > 0 ? id : workspace.publicId;
}

function workspaceIssueProblems(
  issues: Extract<StudioV2WorkspaceActionData, { ok: true; intent: "test" }>["test"]["issues"]
): WorkflowSourceProblem[] {
  return issues.map((issue) => ({
    message: issue.message,
    severity: "error",
    ...(issue.path.some((part) => part === "source") ? { file: STUDIO_V2_SOURCE_ENTRYPOINT } : {}),
  }));
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
  const [testStatus, setTestStatus] = useState<WorkflowSourceTestStatus>("idle");
  const sourceWorkspaceRef = useRef(sourceWorkspace);
  const baselineSignatureRef = useRef(initialSignature);
  const pendingTestRef = useRef(false);
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
        { intent: "test", expectedVersion },
        { method: "post", encType: "application/json" }
      );
    },
    [testFetcher]
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

    saveFetcher.submit(
      {
        intent: "save",
        expectedVersion: studioWorkspace.version,
        document: applied.document,
      },
      { method: "post", encType: "application/json" }
    );
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
    submitTest(studioWorkspace.version);
  }, [dirty, studioWorkspace.version, submitSave, submitTest]);

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
      submitTest(nextWorkspace.version);
    }
  }, [
    onStudioWorkspaceChange,
    saveFetcher.data,
    setBaselineSignature,
    setSourceWorkspace,
    submitTest,
  ]);

  useEffect(() => {
    if (testFetcher.state !== "idle") setTestStatus("running");
  }, [testFetcher.state]);

  useEffect(() => {
    const data = testFetcher.data;
    if (!data) return;
    if (!data.ok) {
      setTestStatus("error");
      setProblems([{ message: data.message, severity: "error" }]);
      return;
    }
    if (data.intent !== "test") return;

    const nextWorkspace = data.workspace as StudioV2ClientWorkspaceProjection;
    onStudioWorkspaceChange(nextWorkspace);
    setTestStatus(data.test.success ? "success" : "error");
    setProblems(workspaceIssueProblems(data.test.issues));
  }, [onStudioWorkspaceChange, testFetcher.data]);

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
        problems={initialProblems}
      />
    </div>
  );
}
