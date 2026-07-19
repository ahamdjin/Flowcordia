import type { JsonObject, JsonValue } from "@flowcordia/workflow";
import type { FlowcordiaPreviewProjection } from "../preview/presentation";
import type { WorkflowStudioDraft, WorkflowStudioGraph } from "./presentation";

export interface WorkflowStudioTestingAvailability {
  visible: boolean;
  structuralEnabled: boolean;
  liveEnabled: boolean;
}

export function workflowStudioTestingAvailability(input: {
  graph: WorkflowStudioGraph | null;
  draft: WorkflowStudioDraft | null;
  preview: FlowcordiaPreviewProjection;
  canWrite: boolean;
  canTriggerPreview: boolean;
  stale: boolean;
  loadError: { code: string; message: string; retryable: boolean } | null;
}): WorkflowStudioTestingAvailability {
  const structuralEnabled = Boolean(
    input.graph &&
    input.canWrite &&
    input.draft &&
    !input.draft.stale &&
    !input.stale &&
    !input.loadError
  );
  const liveEnabled = Boolean(
    input.graph &&
    input.canTriggerPreview &&
    input.preview.state === "READY" &&
    input.preview.proposal?.headSha
  );

  return {
    visible: Boolean(input.graph && (input.draft || input.preview.state === "READY")),
    structuralEnabled,
    liveEnabled,
  };
}

export function buildWorkflowStudioStructuralTestCommand(input: {
  draft: Pick<WorkflowStudioDraft, "publicId" | "version">;
  payload: JsonValue;
  fixture: { nodeId: string; fixtureId: string } | null;
}): JsonObject {
  return {
    operation: "test",
    draftId: input.draft.publicId,
    expectedVersion: input.draft.version,
    payload: input.payload,
    ...(input.fixture ? { fixture: input.fixture } : {}),
  };
}

export function buildWorkflowStudioLiveRunCommand(input: {
  workflowId: string;
  expectedHeadSha: string;
  requestId: string;
  payload: JsonValue;
}): JsonObject {
  return {
    operation: "run",
    workflowId: input.workflowId,
    expectedHeadSha: input.expectedHeadSha,
    requestId: input.requestId,
    payload: input.payload,
  };
}
