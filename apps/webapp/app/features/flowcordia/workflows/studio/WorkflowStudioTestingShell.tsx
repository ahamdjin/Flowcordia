import type { JsonObject, JsonValue } from "@flowcordia/workflow";
import { useFetcher, useRevalidator } from "@remix-run/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { FlowcordiaPreviewProjection } from "../preview/presentation";
import {
  WorkflowFunctionTestPanel,
  type WorkflowFunctionTestResult,
} from "./WorkflowFunctionTestPanel";
import type { WorkflowStudioDraft, WorkflowStudioGraph } from "./presentation";

interface DraftTestResponse {
  ok: boolean;
  status?: "tested";
  test?: WorkflowFunctionTestResult;
  message?: string;
}

interface PreviewRunResponse {
  ok: boolean;
  status?: "started";
  run?: { friendlyId: string; cached: boolean };
  message?: string;
}

export function WorkflowStudioTestingShell({
  graph,
  draft,
  preview,
  repositoryKey,
  draftCommandPath,
  previewCommandPath,
  canWrite,
  canTriggerPreview,
  stale,
  loadError,
  children,
}: {
  graph: WorkflowStudioGraph | null;
  draft: WorkflowStudioDraft | null;
  preview: FlowcordiaPreviewProjection;
  repositoryKey: string;
  draftCommandPath: string;
  previewCommandPath: string;
  canWrite: boolean;
  canTriggerPreview: boolean;
  stale: boolean;
  loadError: { code: string; message: string; retryable: boolean } | null;
  children: ReactNode;
}) {
  const revalidator = useRevalidator();
  const structuralFetcher = useFetcher<DraftTestResponse>();
  const liveFetcher = useFetcher<PreviewRunResponse>();
  const structuralSubmitted = useRef(false);
  const liveSubmitted = useRef(false);
  const [lastTest, setLastTest] = useState<WorkflowFunctionTestResult | null>(null);
  const structuralEnabled = Boolean(
    canWrite && draft && !draft.stale && !stale && !loadError && graph
  );

  useEffect(() => {
    if (!structuralSubmitted.current || structuralFetcher.state !== "idle") return;
    structuralSubmitted.current = false;
    if (structuralFetcher.data?.ok && structuralFetcher.data.test) {
      setLastTest({
        success: structuralFetcher.data.test.success,
        output: structuralFetcher.data.test.output,
        traces: structuralFetcher.data.test.traces.map((trace) => ({ ...trace })),
      });
    }
    revalidator.revalidate();
  }, [revalidator, structuralFetcher.data, structuralFetcher.state]);

  useEffect(() => {
    if (!liveSubmitted.current || liveFetcher.state !== "idle") return;
    liveSubmitted.current = false;
    revalidator.revalidate();
  }, [liveFetcher.state, revalidator]);

  const runStructural = (payload: JsonValue) => {
    if (!draft || !structuralEnabled || structuralFetcher.state !== "idle") return;
    const command: JsonObject = {
      operation: "test",
      draftId: draft.publicId,
      expectedVersion: draft.version,
      payload,
    };
    structuralSubmitted.current = true;
    structuralFetcher.submit(command, {
      method: "POST",
      action: draftCommandPath,
      encType: "application/json",
    });
  };

  const runLive = (payload: JsonValue) => {
    if (
      !graph ||
      !canTriggerPreview ||
      preview.state !== "READY" ||
      !preview.proposal?.headSha ||
      liveFetcher.state !== "idle"
    ) {
      return;
    }
    const command: JsonObject = {
      operation: "run",
      workflowId: graph.workflowId,
      expectedHeadSha: preview.proposal.headSha,
      requestId: crypto.randomUUID(),
      payload,
    };
    liveSubmitted.current = true;
    liveFetcher.submit(command, {
      method: "POST",
      action: previewCommandPath,
      encType: "application/json",
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {graph && (draft || preview.state === "READY") && (
        <WorkflowFunctionTestPanel
          graph={graph}
          preview={preview}
          repositoryKey={repositoryKey}
          structuralBusy={structuralFetcher.state !== "idle"}
          liveBusy={liveFetcher.state !== "idle"}
          canRunStructural={structuralEnabled}
          canRunLive={canTriggerPreview}
          lastTest={lastTest}
          onRunStructural={runStructural}
          onRunLive={runLive}
        />
      )}
      {structuralFetcher.data && !structuralFetcher.data.ok && (
        <div className="border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          {structuralFetcher.data.message ?? "The structural preview failed safely."}
        </div>
      )}
      {liveFetcher.data && !liveFetcher.data.ok && (
        <div className="border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          {liveFetcher.data.message ?? "The live preview run failed to start."}
        </div>
      )}
      {liveFetcher.data?.ok && liveFetcher.data.run && (
        <div className="border-b border-blue-500/25 bg-blue-500/10 px-4 py-2 text-xs text-blue-200">
          Live preview run {liveFetcher.data.run.friendlyId} started on the exact proposal
          deployment.
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
