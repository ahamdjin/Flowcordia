import { readFileSync } from "node:fs";
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
    operationsState: "NOT_CHECKED",
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

  it("keeps production incomplete until operations readiness is accepted", () => {
    expect(
      steps({
        proposalState: "MERGED",
        productionState: "READY",
        operationsState: "NOT_CHECKED",
      }).find((step) => step.id === "production")
    ).toMatchObject({ tone: "active", detail: "Operations check required" });
    expect(
      steps({
        proposalState: "MERGED",
        productionState: "READY",
        operationsState: "BLOCKED",
      }).find((step) => step.id === "production")
    ).toMatchObject({ tone: "blocked", detail: "Operations blocked" });
    expect(
      steps({
        proposalState: "MERGED",
        productionState: "READY",
        operationsState: "READY",
      }).find((step) => step.id === "production")
    ).toMatchObject({ tone: "complete", detail: "Production proven" });
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

  it("keeps the canvas primary and recovery inside the production operations stage", () => {
    const route = readFileSync(
      new URL(
        "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx",
        import.meta.url
      ),
      "utf8"
    );
    const canvas = route.indexOf('<main className="min-h-0 min-w-0 flex-1"');
    const operations = route.indexOf('data-testid="flowcordia-operations-workspace"');
    expect(route).toContain("<WorkflowLifecycleRail");
    expect(route).toContain("data-selected-step={selectedLifecycleStep}");
    expect(route).toContain('hidden={selectedLifecycleStep !== "production"}');
    expect(route).toContain("<WorkflowRollbackPanel");
    expect(canvas).toBeGreaterThan(-1);
    expect(operations).toBeGreaterThan(canvas);
  });
});
