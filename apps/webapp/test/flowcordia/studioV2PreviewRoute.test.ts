import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), "../..", path), "utf8");
}

const routePath =
  "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.studio-v2/route.tsx";

describe("Flowcordia Studio V2 preview route", () => {
  const route = readRepositoryFile(routePath);

  it("renders the isolated Studio V2 surface inside the authenticated project layout", () => {
    expect(route).toContain("StudioV2Surface");
    expect(route).toContain('data-testid="flowcordia-studio-v2-preview-route"');
    expect(route).toContain('data-source-control="optional"');
    expect(route).toContain('data-persistence="in-memory"');
  });

  it("does not make the preview route depend on repository or GitHub data", () => {
    expect(route).not.toContain("queryWorkflowStudio");
    expect(route).not.toContain("resolveFlowcordiaProjectContext");
    expect(route).not.toContain("githubAppInstallPath");
    expect(route).not.toContain("authorization:");
    expect(route).not.toContain("loader =");
  });
});
