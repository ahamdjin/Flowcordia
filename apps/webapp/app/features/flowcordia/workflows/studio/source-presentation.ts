import type { WorkflowDraftSourceFileRecord } from "../drafts/source-types";
import { isWorkflowDraftSourceChanged } from "../drafts/source-types";

export interface WorkflowStudioSourceBuffer {
  publicId: string;
  functionId: string;
  sourcePath: string;
  exportName: string;
  version: string;
  baseSourceSha256: string;
  sourceSha256: string;
  changed: boolean;
  updatedAt: string;
}

export function presentWorkflowStudioSourceBuffer(
  source: WorkflowDraftSourceFileRecord
): WorkflowStudioSourceBuffer {
  return {
    publicId: source.publicId,
    functionId: source.functionId,
    sourcePath: source.sourcePath,
    exportName: source.exportName,
    version: source.version.toString(),
    baseSourceSha256: source.baseSourceSha256,
    sourceSha256: source.sourceSha256,
    changed: isWorkflowDraftSourceChanged(source),
    updatedAt: source.updatedAt.toISOString(),
  };
}
