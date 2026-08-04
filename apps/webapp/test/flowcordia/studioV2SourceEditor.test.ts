import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), "../..", path), "utf8");
}

const routePath =
  "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.studio-v2/route.tsx";
const hostPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2ActivepiecesHost.tsx";
const sourceWorkspacePath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source/StudioV2SourceWorkspace.tsx";
const sourceWorkspaceClientPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source/StudioV2SourceWorkspace.client.tsx";
const sourceModelPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source/workspace-model.ts";
const legacySourceWorkspacePath =
  "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowSourceWorkspace.tsx";
const webappPackagePath = "apps/webapp/package.json";

describe("Flowcordia Studio V2 Source editor foundation", () => {
  const route = readRepositoryFile(routePath);
  const host = readRepositoryFile(hostPath);
  const sourceWorkspace = readRepositoryFile(sourceWorkspacePath);
  const sourceWorkspaceClient = readRepositoryFile(sourceWorkspaceClientPath);
  const sourceModel = readRepositoryFile(sourceModelPath);
  const legacySourceWorkspace = readRepositoryFile(legacySourceWorkspacePath);
  const webappPackage = readRepositoryFile(webappPackagePath);

  it("adds Source as URL-backed Studio navigation without replacing the visual editor", () => {
    expect(route).toContain("resolveStudioV2View(searchParams)");
    expect(route).toContain('value="editor"');
    expect(route).toContain('value="source"');
    expect(route).toContain("studioV2SearchParamsForView(searchParams, view)");
    expect(route).toContain("StudioV2ActivepiecesHost");
    expect(route).toContain("StudioV2SourceSurface");
  });

  it("keeps the Activepieces iframe mounted and refreshes its viewport when Editor returns", () => {
    expect(route.indexOf("<StudioV2ActivepiecesHost")).toBeLessThan(route.indexOf("{sourceMounted ? ("));
    expect(route).toContain('active={studioView === "editor"}');
    expect(route).toContain('studioView === "editor" ? "visible" : "invisible pointer-events-none"');
    expect(host).toContain("aria-hidden={!active}");
    expect(host).toContain("tabIndex={active ? 0 : -1}");
    expect(host).toContain('contentWindow?.dispatchEvent(new Event("resize"))');
    expect(host).toContain('className="block h-full min-h-0 w-full');
  });

  it("pins Sandpack and isolates all Sandpack imports to the client adapter", () => {
    expect(webappPackage).toContain('"@codesandbox/sandpack-react": "2.20.0"');
    expect(sourceWorkspace).not.toContain("@codesandbox/sandpack-react");
    expect(sourceModel).not.toContain("@codesandbox/sandpack-react");
    expect(sourceWorkspaceClient).toContain('from "@codesandbox/sandpack-react"');
    expect(sourceWorkspaceClient).not.toContain("@codesandbox/sandpack-react/");
    expect(sourceWorkspaceClient).toContain("SandpackProvider");
    expect(sourceWorkspaceClient).toContain("SandpackLayout");
    expect(sourceWorkspaceClient).toContain("SandpackFileExplorer");
    expect(sourceWorkspaceClient).toContain("SandpackCodeEditor");
    expect(sourceWorkspaceClient).toContain("useSandpack");
  });

  it("does not activate Sandpack browser execution or CodeSandbox preview services", () => {
    expect(sourceWorkspaceClient).toContain("autorun: false");
    expect(sourceWorkspaceClient).toContain("autoReload: false");
    expect(sourceWorkspaceClient).toContain("skipEval: true");
    expect(sourceWorkspaceClient).toContain("showRunButton={false}");
    expect(sourceWorkspaceClient).not.toContain("SandpackPreview");
    expect(sourceWorkspaceClient).not.toContain("Nodebox");
    expect(sourceWorkspaceClient).not.toContain("OpenInCodeSandbox");
    expect(sourceWorkspaceClient).not.toContain("bundlerURL");
  });

  it("uses existing Trigger.dev panels and honest Output, Logs, and Problems states", () => {
    expect(sourceWorkspaceClient).toContain("ResizablePanelGroup");
    expect(sourceWorkspaceClient).toContain("ResizableHandle");
    expect(sourceWorkspaceClient).toContain("ClientTabs");
    expect(sourceWorkspaceClient).toContain('value="output"');
    expect(sourceWorkspaceClient).toContain('value="logs"');
    expect(sourceWorkspaceClient).toContain('value="problems"');
    expect(sourceWorkspaceClient).toContain("Trigger.dev testing is not connected to Source yet.");
    expect(sourceWorkspaceClient).not.toContain("fake");
  });

  it("keeps the narrow layout bounded and makes the file explorer collapsible", () => {
    expect(sourceWorkspaceClient).toContain('aria-controls="studio-v2-source-files"');
    expect(sourceWorkspaceClient).toContain("aria-expanded={mobileFilesOpen}");
    expect(sourceWorkspaceClient).toContain('className="sm:hidden"');
    expect(sourceWorkspaceClient).toContain('mobileFilesOpen ? "!flex sm:!flex" : "!hidden sm:!flex"');
    expect(sourceWorkspaceClient).toContain("!min-w-0");
    expect(route).toContain("min-w-0 flex-col overflow-hidden");
  });

  it("keeps the legacy Source workspace intact as a separate implementation", () => {
    expect(legacySourceWorkspace).toContain("export function WorkflowSourceWorkspace");
    expect(sourceWorkspace).toContain("export function StudioV2SourceWorkspace");
  });
});
