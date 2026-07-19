import type { JsonValue } from "@flowcordia/workflow";
import { useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import type { WorkflowFunctionCatalogProjection } from "../functions/presentation";
import type { FlowcordiaPreviewProjection } from "../preview/presentation";
import {
  WorkflowFunctionTestPanel,
  type WorkflowFunctionTestResult,
} from "./WorkflowFunctionTestPanel";
import type { WorkflowStudioDraft, WorkflowStudioGraph } from "./presentation";
import {
  buildWorkflowStudioLiveRunCommand,
  buildWorkflowStudioStructuralTestCommand,
  workflowStudioTestingAvailability,
} from "./testing-command";

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

export function WorkflowStudioTestingPanel({
  graph,
  draft,
  preview,
  functionCatalog,
  repositoryKey,
  draftCommandPath,
  previewCommandPath,
  canWrite,
  canTriggerPreview,
  stale,
  loadError,
}: {
  graph: WorkflowStudioGraph | null;
  draft: WorkflowStudioDraft | null;
  preview: FlowcordiaPreviewProjection;
  functionCatalog: WorkflowFunctionCatalogProjection;
  repositoryKey: string;
  draftCommandPath: string;
  previewCommandPath: string;
  canWrite: boolean;
  canTriggerPreview: boolean;
  stale: boolean;
  loadError: { code: string; message: string; retryable: boolean } | null;
}) {
  const revalidator = useRevalidator();
  const structuralFetcher = useFetcher<DraftTestResponse>();
  const liveFetcher = useFetcher<PreviewRunResponse>();
  const structuralSubmitted = useRef(false);
  const liveSubmitted = useRef(false);
  const [lastTest, setLastTest] = useState<WorkflowFunctionTestResult | null>(null);
  const availability = workflowStudioTestingAvailability({
    graph,
    draft,
    preview,
    canWrite,
    canTriggerPreview,
    stale,
    loadError,
  });

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

  if (!graph || !availability.visible) return null;

  const runStructural = (
    payload: JsonValue,
    fixture: { nodeId: string; fixtureId: string } | null
  ) => {
    if (!draft || !availability.structuralEnabled || structuralFetcher.state !== "idle") return;
    structuralSubmitted.current = true;
    structuralFetcher.submit(
      buildWorkflowStudioStructuralTestCommand({ draft, payload, fixture }),
      {
        method: "POST",
        action: draftCommandPath,
        encType: "application/json",
      }
    );
  };

  const runLive = (payload: JsonValue) => {
    if (!availability.liveEnabled || !preview.proposal?.headSha || liveFetcher.state !== "idle") {
      return;
    }
    liveSubmitted.current = true;
    liveFetcher.submit(
      buildWorkflowStudioLiveRunCommand({
        workflowId: graph.workflowId,
        expectedHeadSha: preview.proposal.headSha,
        requestId: crypto.randomUUID(),
        payload,
      }),
      {
        method: "POST",
        action: previewCommandPath,
        encType: "application/json",
      }
    );
  };

  return (
    <>
      <WorkflowFunctionTestPanel
        graph={graph}
        preview={preview}
        functionCatalog={functionCatalog}
        repositoryKey={repositoryKey}
        structuralBusy={structuralFetcher.state !== "idle"}
        liveBusy={liveFetcher.state !== "idle"}
        canRunStructural={availability.structuralEnabled}
        canRunLive={availability.liveEnabled}
        lastTest={lastTest}
        onRunStructural={runStructural}
        onRunLive={runLive}
      />
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
    </>
  );
}
