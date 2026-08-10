import { compileStudioV2WorkflowToTriggerTask } from "@flowcordia/runtime";
import { validateStudioV2WorkspaceDocument } from "../workspace-contract";
import {
  STUDIO_V2_GENERATED_SOURCE,
  type StudioV2GeneratedWorkflowSource,
} from "./workspace-model";

export function generateStudioV2WorkflowSource(input: {
  document: unknown;
  documentSha256: string;
}): StudioV2GeneratedWorkflowSource {
  const validated = validateStudioV2WorkspaceDocument(input.document);
  if (!validated.success) {
    return {
      documentSha256: input.documentSha256,
      path: STUDIO_V2_GENERATED_SOURCE,
      code: null,
      orderedNodeIds: [],
      warnings: [],
      issues: validated.issues.map((issue) => ({ message: issue.message })),
    };
  }

  const compiled = compileStudioV2WorkflowToTriggerTask(validated.workflow);
  if (!compiled.success) {
    return {
      documentSha256: input.documentSha256,
      path: STUDIO_V2_GENERATED_SOURCE,
      code: null,
      orderedNodeIds: [],
      warnings: [],
      issues: compiled.issues.map((issue) => ({
        message: issue.message,
        ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
      })),
    };
  }

  return {
    documentSha256: input.documentSha256,
    path: STUDIO_V2_GENERATED_SOURCE,
    code: compiled.artifact.source,
    orderedNodeIds: compiled.artifact.orderedNodeIds,
    warnings: compiled.artifact.warnings,
    issues: [],
  };
}
