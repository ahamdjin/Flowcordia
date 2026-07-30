import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), "../..", path), "utf8");
}

const routePath =
  "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.studio-v2/route.tsx";
const surfacePath = "apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2Surface.tsx";
const releaseControlsPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2ReleaseControls.tsx";

describe("Flowcordia Studio V2 route", () => {
  const route = readRepositoryFile(routePath);
  const surface = readRepositoryFile(surfacePath);
  const releaseControls = readRepositoryFile(releaseControlsPath);

  it("loads durable workspace and immutable release state inside the project layout", () => {
    expect(route).toContain("loadOrCreateStudioV2Workspace");
    expect(route).toContain("loadLatestStudioV2Release");
    expect(route).toContain("StudioV2ReleaseControls");
    expect(route).toContain("StudioV2Surface");
    expect(route).toContain('data-testid="flowcordia-studio-v2-preview-route"');
    expect(route).toContain('data-source-control="optional"');
    expect(route).toContain('data-persistence="durable-local"');
  });

  it("authorizes writes with project environment permissions rather than GitHub access", () => {
    expect(route).toContain('ability.can("write", { type: "envvars"');
    expect(route).not.toContain('resource: { type: "github" }');
    expect(route).not.toContain("resolveControlPlaneScope");
    expect(route).not.toContain("githubAppInstallPath");
  });

  it("connects save, test, and immutable stage commands to focused browser controls", () => {
    expect(route).toContain("saveStudioV2Workspace");
    expect(route).toContain("structurallyTestStudioV2Workspace");
    expect(route).toContain("stageStudioV2Workspace");
    expect(surface).toContain('intent: "save"');
    expect(surface).toContain('intent: "test"');
    expect(releaseControls).toContain('intent: "stage"');
    expect(releaseControls).toContain('encType: "application/json"');
    expect(releaseControls).toContain("expectedVersion: workspace.version");
  });
});
