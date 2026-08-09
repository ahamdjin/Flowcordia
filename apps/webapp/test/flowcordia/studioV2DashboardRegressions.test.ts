import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), "../..", path), "utf8");
}

const studioRoutePath =
  "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.studio-v2/route.tsx";
const integrationsRoutePath =
  "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.settings.integrations/route.tsx";
const deploymentsRoutePath =
  "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.deployments/route.tsx";

describe("Flowcordia dashboard regressions", () => {
  it("keeps Studio home separate from a selected workflow workspace", () => {
    const route = readRepositoryFile(studioRoutePath);
    expect(route).toContain("StudioV2WorkflowLibrary");
    expect(route).toContain("workspace: null");
    expect(route).not.toContain("catalog.workflows[0]");
    expect(route).not.toContain("StudioV2WorkflowStrip");
  });

  it("renders integration guidance and build settings when GitHub App is disabled", () => {
    const route = readRepositoryFile(integrationsRoutePath);
    expect(route).toContain("githubAppEnabled ? (");
    expect(route).toContain("GitHub App is not configured");
    expect(route).toContain("Open GitHub App setup");
    expect(route).toContain("<BuildSettingsForm");
    expect(route).not.toContain("{githubAppEnabled && (");
  });

  it("does not call a client runtime export from the deployment server module", () => {
    const route = readRepositoryFile(deploymentsRoutePath);
    expect(route).not.toContain("canRequestFlowcordiaDeployLatest,");
    expect(route).toContain('["NOT_DEPLOYED", "OUTDATED", "FAILED"].includes(latest.state)');
  });
});
