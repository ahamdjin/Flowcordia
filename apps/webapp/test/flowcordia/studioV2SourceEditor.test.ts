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
const sourceWorkspaceViewPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source/StudioV2SourceWorkspaceView.client.tsx";
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
  const sourceWorkspaceView = readRepositoryFile(sourceWorkspaceViewPath);
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
    expect(route.indexOf("<StudioV2ActivepiecesHost")).toBeLessThan(
      route.indexOf("{sourceMounted ? (")
    );
    expect(route).toContain('active={studioView === "editor"}');
    expect(route).toContain(
      'studioView === "editor" ? "visible" : "invisible pointer-events-none"'
    );
    expect(host).toContain("aria-hidden={!active}");
    expect(host).toContain("tabIndex={active ? 0 : -1}");
    expect(host).toContain('contentWindow?.dispatchEvent(new Event("resize"))');
    expect(host).toContain('className="block h-full min-h-0 w-full');
  });

  it("pins Sandpack but keeps every Sandpack presentation primitive out of the Source view", () => {
    expect(webappPackage).toContain('"@codesandbox/sandpack-react": "2.20.0"');
    expect(sourceWorkspace).not.toContain("@codesandbox/sandpack-react");
    expect(sourceModel).not.toContain("@codesandbox/sandpack-react");
    expect(sourceWorkspaceView).not.toContain("@codesandbox/sandpack-react");

    expect(sourceWorkspaceClient).toContain('from "@codesandbox/sandpack-react"');
    expect(sourceWorkspaceClient).not.toContain("@codesandbox/sandpack-react/");
    expect(sourceWorkspaceClient).toContain("SandpackProvider");
    expect(sourceWorkspaceClient).toContain("useSandpack");
    expect(sourceWorkspaceClient).not.toContain("SandpackLayout");
    expect(sourceWorkspaceClient).not.toContain("SandpackFileExplorer");
    expect(sourceWorkspaceClient).not.toContain("SandpackCodeEditor");
    expect(sourceWorkspaceClient).not.toContain("SandpackPreview");

    expect(sourceWorkspaceView).toContain("TextEditor");
    expect(sourceWorkspaceView).toContain("StudioV2SourceWorkspaceView");
    expect(sourceWorkspaceClient).toContain("StudioV2SourceWorkspaceView");
  });

  it("does not activate Sandpack browser execution or CodeSandbox preview services", () => {
    expect(sourceWorkspaceClient).toContain("autorun: false");
    expect(sourceWorkspaceClient).toContain("autoReload: false");
    expect(sourceWorkspaceClient).toContain("skipEval: true");
    expect(sourceWorkspaceClient).not.toContain("SandpackPreview");
    expect(sourceWorkspaceClient).not.toContain("Nodebox");
    expect(sourceWorkspaceClient).not.toContain("OpenInCodeSandbox");
    expect(sourceWorkspaceClient).not.toContain("bundlerURL");
  });

  it("keeps the editor dominant and the lower utility surface collapsed by default", () => {
    expect(sourceWorkspaceView).toContain('data-testid="flowcordia-source-lower-panel"');
    expect(sourceWorkspaceView).toContain('useState(false)');
    expect(sourceWorkspaceView).toContain('open ? "h-44" : "h-9"');
    expect(sourceWorkspaceView).toContain('value="output"');
    expect(sourceWorkspaceView).toContain('value="logs"');
    expect(sourceWorkspaceView).toContain('value="problems"');
    expect(sourceWorkspaceView).toContain('value="terminal"');
    expect(sourceWorkspaceView).toContain("No output yet.");
    expect(sourceWorkspaceView).toContain("No logs yet.");
    expect(sourceWorkspaceView).toContain("No problems.");
    expect(sourceWorkspaceView).not.toContain("fake");
  });

  it(
    "uses a Flowcordia file rail that is optional instead of permanently consuming editor width",
    () => {
      expect(sourceWorkspaceView).toContain('aria-controls="studio-v2-source-files"');
      expect(sourceWorkspaceView).toContain("aria-expanded={filesOpen}");
      expect(sourceWorkspaceView).toContain('data-testid="flowcordia-source-files"');
      expect(sourceWorkspaceView).toContain("{filesOpen ? (");
      expect(sourceWorkspaceView).toContain("min-h-0 min-w-0 flex-1 overflow-hidden");
      expect(sourceWorkspaceView).not.toContain("SandpackFileExplorer");
    }
  );

  it("describes the current in-memory persistence contract accurately", () => {
    expect(route).toContain('data-persistence="session-memory"');
    expect(route).not.toContain('data-persistence="durable-local"');
  });

  it("keeps the legacy Source workspace intact as a separate implementation", () => {
    expect(legacySourceWorkspace).toContain("export function WorkflowSourceWorkspace");
    expect(sourceWorkspace).toContain("export function StudioV2SourceWorkspace");
  });
});
