import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webappRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(webappRoot, path), "utf8");
}

describe("self-host first-run source boundary", () => {
  it("creates the administrator without a setup code and prepares the default workspace", () => {
    const owner = source("app/routes/setup_.owner/route.tsx");
    const ownerService = source("app/features/flowcordia/setup/firstOwner.server.ts");
    const target = source("app/features/flowcordia/setup/selfHostFirstRun.server.ts");

    expect(owner).toContain("ensureSelfHostFirstRunTarget");
    expect(owner).toContain('let nextPath = "/setup/first-run"');
    expect(owner).toContain("Welcome to Flowcordia");
    expect(owner).toContain("isSameOriginSetupRequest");
    expect(owner).toContain('variant="large"');
    expect(owner).not.toContain("setupToken");
    expect(owner).not.toContain("installation code");
    expect(ownerService).not.toContain("FLOWCORDIA_SETUP_TOKEN");
    expect(ownerService).not.toContain("constantTimeTokenMatches");
    expect(target).toContain('SELF_HOST_FIRST_RUN_WORKSPACE_NAME = "My workspace"');
    expect(target).toContain('SELF_HOST_FIRST_RUN_PROJECT_NAME = "My workflows"');
    expect(target).toContain("createOrganization");
    expect(target).toContain("createProject");
  });

  it("keeps healthy infrastructure and optional email out of the critical path", () => {
    const firstRun = source("app/routes/setup.first-run/route.tsx");

    expect(firstRun).toContain('item.state !== "ready"');
    expect(firstRun).toContain("Healthy services are hidden");
    expect(firstRun).not.toContain('to="/setup/email"');
    expect(firstRun).not.toContain("generalEmailReady");
  });

  it("uses one polished guided surface for GitHub and Studio entry", () => {
    const firstRun = source("app/routes/setup.first-run/route.tsx");

    expect(firstRun).toContain("rounded-2xl");
    expect(firstRun).toContain("configureFlowcordiaGitHubApp");
    expect(firstRun).toContain("githubAppInstallPath");
    expect(firstRun).toContain("repository.defaultBranch");
    expect(firstRun).toContain("synchronizeRepository");
    expect(firstRun).toContain("flowcordiaStudioPath");
    expect(firstRun).not.toContain('name="productionBranch"');
    expect(firstRun).not.toContain("bootstrap-starter");
    expect(firstRun).not.toContain("Create organization");
    expect(firstRun).not.toContain("Create project");
  });

  it("keeps the old setup hub available only as advanced troubleshooting", () => {
    const setup = source("app/routes/setup/route.tsx");

    expect(setup).toContain('url.searchParams.get("advanced") !== "1"');
    expect(setup).toContain('throw redirect("/setup/first-run")');
    expect(setup).toContain("Advanced administration");
  });
});
