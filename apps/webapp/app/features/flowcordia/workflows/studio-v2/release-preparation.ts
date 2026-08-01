import { createHash } from "node:crypto";
import {
  compileStudioV2WorkflowToTriggerTask,
  type FlowcordiaCompilationArtifact,
} from "@flowcordia/runtime";
import type { JsonObject } from "@flowcordia/workflow";
import { StudioV2ReleaseError } from "./release-contract";
import type { StudioV2WorkspaceRecord } from "./workspace-contract";

export interface StudioV2PreparedRelease {
  workspace: StudioV2WorkspaceRecord;
  artifact: FlowcordiaCompilationArtifact;
  sourceSha256: string;
  triggerBinding: JsonObject | null;
}

function jsonObject(value: unknown): JsonObject | null {
  if (value === null || value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

export function prepareStudioV2Release(input: {
  workspace: StudioV2WorkspaceRecord;
  expectedVersion: bigint;
}): StudioV2PreparedRelease {
  if (input.expectedVersion < 1n || input.workspace.version !== input.expectedVersion) {
    throw new StudioV2ReleaseError(
      "release_conflict",
      "The Studio V2 workspace changed before staging began. Reload and stage the latest saved version."
    );
  }
  if (
    input.workspace.testedVersion !== input.workspace.version ||
    input.workspace.lastTestSucceeded !== true
  ) {
    throw new StudioV2ReleaseError(
      "release_not_tested",
      "The current Studio V2 workspace version must pass structural testing before it can be staged."
    );
  }

  const compiled = compileStudioV2WorkflowToTriggerTask(input.workspace.document);
  if (!compiled.success) {
    throw new StudioV2ReleaseError(
      "compilation_failed",
      compiled.issues[0]?.message ?? "The Studio V2 workflow could not be compiled for staging."
    );
  }

  return {
    workspace: input.workspace,
    artifact: compiled.artifact,
    sourceSha256: createHash("sha256").update(compiled.artifact.source).digest("hex"),
    triggerBinding: jsonObject(compiled.artifact.triggerBinding),
  };
}
