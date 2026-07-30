import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { StudioV2ReleaseError } from "./release-contract";
import { prepareStudioV2Release } from "./release-preparation";
import type { StudioV2WorkspaceRecord } from "./workspace-contract";

function workspace(overrides: Partial<StudioV2WorkspaceRecord> = {}): StudioV2WorkspaceRecord {
  const now = new Date("2026-07-31T00:00:00.000Z");
  return {
    id: "workspace-id",
    publicId: "00000000-0000-4000-8000-000000000001",
    scope: {
      organizationId: "organization-id",
      projectId: "project-id",
      environmentId: "environment-id",
      workspaceKey: "default",
    },
    document: createStudioV2VerticalSliceWorkflow(),
    documentSha256: "a".repeat(64),
    version: 3n,
    testedVersion: 3n,
    lastTestSucceeded: true,
    createdByActorId: "actor-id",
    updatedByActorId: "actor-id",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Studio V2 release preparation", () => {
  it("compiles one exact tested version and hashes the generated source", () => {
    const prepared = prepareStudioV2Release({ workspace: workspace(), expectedVersion: 3n });

    expect(prepared.artifact.taskId).toBeTruthy();
    expect(prepared.artifact.source).toContain("executeFlowcordiaWorkflow");
    expect(prepared.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared.triggerBinding).toEqual(prepared.artifact.triggerBinding);
  });

  it("rejects stale or untested workspace revisions", () => {
    expect(() => prepareStudioV2Release({ workspace: workspace(), expectedVersion: 2n })).toThrow(
      StudioV2ReleaseError
    );
    expect(() =>
      prepareStudioV2Release({
        workspace: workspace({ testedVersion: null, lastTestSucceeded: null }),
        expectedVersion: 3n,
      })
    ).toThrow("must pass structural testing");
    expect(() =>
      prepareStudioV2Release({
        workspace: workspace({ testedVersion: 3n, lastTestSucceeded: false }),
        expectedVersion: 3n,
      })
    ).toThrow("must pass structural testing");
  });
});
