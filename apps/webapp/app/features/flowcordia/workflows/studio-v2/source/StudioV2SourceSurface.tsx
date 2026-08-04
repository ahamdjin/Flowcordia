import { useMemo } from "react";
import { StudioV2SourceWorkspace } from "./StudioV2SourceWorkspace";
import { createInitialStudioV2SourceWorkspace } from "./workspace-model";

export function StudioV2SourceSurface({
  workflowId,
  readOnly = false,
}: {
  workflowId: string;
  readOnly?: boolean;
}) {
  const workspace = useMemo(() => createInitialStudioV2SourceWorkspace(workflowId), [workflowId]);

  return (
    <div
      data-testid="flowcordia-studio-v2-source-surface"
      data-workflow-source-draft={workflowId}
      className="h-full min-h-0 min-w-0 overflow-hidden"
    >
      <StudioV2SourceWorkspace workspace={workspace} readOnly={readOnly} />
    </div>
  );
}
