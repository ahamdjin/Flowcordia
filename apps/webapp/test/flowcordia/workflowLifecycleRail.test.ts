import { describe, expect, it } from "vitest";
import {
  buildWorkflowLifecycleSteps,
  findDefaultLifecycleStep,
} from "../../app/features/flowcordia/workflows/studio/WorkflowLifecycleRail";

function steps(overrides: Partial<Parameters<typeof buildWorkflowLifecycleSteps>[0]> = {}) {
  return buildWorkflowLifecycleSteps({
    syncState: "IDLE",
    loadErrorCode: null,
    readinessState: "READY",
    workflowSelected: true,
    draftPresent: false,
    draftStale: false,
    proposalState: "NONE",
    previewState: "NOT_REQUESTED",
    productionState: "NOT_PROMOTED",
    ...overrides,
  });
}

describe("Flowcordia workflow lifecycle rail", () => {
  it("projects one stable five-stage product journey", () => {
    expect(steps().map((step) => step.id)).toEqual([
      "repository",
      "build",
      "review",
      "preview",
      "production",
    ]);
    expect(steps()[0]).toMatchObject({ tone: "complete", detail: "Connected and ready" });
  });

  it("does not claim repository completion before rollout readiness is proven", () => {
    expect(steps({ readinessState: "NOT_CHECKED" })[0]).toMatchObject({
      tone: "active",
      detail: "Readiness check required",
    });
    expect(steps({ readinessState: "BLOCKED" })[0]).toMatchObject({
      tone: "blocked",
      detail: "Readiness blocked",
    });
  });

  it("marks a generated build complete while keeping an open review active", () => {
    const projected = steps({ proposalState: "OPEN", previewState: "READY" });
    expect(projected.find((step) => step.id === "build")?.tone).toBe("complete");
    expect(projected.find((step) => step.id === "review")?.tone).toBe("active");
    expect(projected.find((step) => step.id === "preview")?.tone).toBe("complete");
  });

  it("requires an authoritative merge before review is complete", () => {
    expect(steps({ proposalState: "OPEN" }).find((step) => step.id === "review")?.tone).toBe(
      "active"
    );
    expect(steps({ proposalState: "MERGED" }).find((step) => step.id === "review")?.tone).toBe(
      "complete"
    );
  });

  it("makes stale drafts and unavailable release paths explicit blockers", () => {
    const projected = steps({
      draftPresent: true,
      draftStale: true,
      previewState: "FAILED",
      productionState: "OUT_OF_SYNC",
    });
    expect(projected.find((step) => step.id === "build")?.tone).toBe("blocked");
    expect(projected.find((step) => step.id === "preview")?.tone).toBe("blocked");
    expect(projected.find((step) => step.id === "production")?.tone).toBe("blocked");
  });

  it("opens the first blocker, then active work, then the completed production stage", () => {
    expect(findDefaultLifecycleStep(steps({ previewState: "FAILED" }))).toBe("preview");
    expect(findDefaultLifecycleStep(steps({ readinessState: "NOT_CHECKED" }))).toBe("repository");
    expect(
      findDefaultLifecycleStep(
        steps({
          proposalState: "MERGED",
          previewState: "READY",
          productionState: "READY",
        })
      )
    ).toBe("production");
  });
});
