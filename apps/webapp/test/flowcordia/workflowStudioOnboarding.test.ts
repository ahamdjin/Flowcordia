import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFlowcordiaOnboardingProjection } from "../../app/features/flowcordia/workflows/onboarding/contract";

describe("Flowcordia Studio onboarding", () => {
  it("gives a project writer one ordered setup path without claiming GitHub installation state", () => {
    const projection = buildFlowcordiaOnboardingProjection({
      configurationError: null,
      repositoryConnected: false,
      synchronizationAvailable: false,
      canWrite: true,
    });

    expect(projection.state).toBe("ACTION_REQUIRED");
    expect(projection.steps.map((step) => [step.id, step.state])).toEqual([
      ["github_app", "unknown"],
      ["repository", "active"],
      ["synchronization", "waiting"],
    ]);
    expect(projection.actions.map((action) => action.id)).toEqual([
      "install_github",
      "open_integrations",
      "refresh",
    ]);
  });

  it("advances to synchronization only after a repository is server-resolved", () => {
    const projection = buildFlowcordiaOnboardingProjection({
      configurationError: "The production branch is not configured.",
      repositoryConnected: true,
      synchronizationAvailable: false,
      canWrite: true,
    });

    expect(projection.message).toBe("The production branch is not configured.");
    expect(projection.steps.find((step) => step.id === "repository")?.state).toBe("complete");
    expect(projection.steps.find((step) => step.id === "synchronization")?.state).toBe("active");
  });

  it("does not offer repository mutation actions to read-only users", () => {
    const projection = buildFlowcordiaOnboardingProjection({
      configurationError: null,
      repositoryConnected: false,
      synchronizationAvailable: false,
      canWrite: false,
    });

    expect(projection.state).toBe("READ_ONLY");
    expect(projection.actions).toEqual([{ id: "refresh", label: "Check again", kind: "refresh" }]);
  });

  it("composes the guided onboarding surface into the disconnected Studio route", () => {
    const route = readFileSync(
      new URL(
        "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx",
        import.meta.url
      ),
      "utf8"
    );

    expect(route).toContain("<FlowcordiaStudioOnboarding");
    expect(route).toContain("githubAppInstallPath");
    expect(route).toContain("v3ProjectSettingsIntegrationsPath");
    expect(route).not.toContain("Workflow Studio is not connected");
  });
});
