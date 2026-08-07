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
const sourceSurfacePath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source/StudioV2SourceSurface.tsx";
const sourceWorkspacePath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source/StudioV2SourceWorkspace.tsx";
const sourceWorkspaceClientPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source/StudioV2SourceWorkspace.client.tsx";
const sourceWorkspaceViewPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source/StudioV2SourceWorkspaceView.client.tsx";
const sourceModelPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source/workspace-model.ts";
const sourceTestContextPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source-test-context.server.ts";
const sourceTestServicePath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/source-test.server.ts";
const legacySourceWorkspacePath =
  "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowSourceWorkspace.tsx";
const webappPackagePath = "apps/webapp/package.json";

describe("Flowcordia Studio V2 Source editor foundation", () => {
  const route = readRepositoryFile(routePath);
  const host = readRepositoryFile(hostPath);
  const sourceSurface = readRepositoryFile(sourceSurfacePath);
  const sourceWorkspace = readRepositoryFile(sourceWorkspacePath);
  const sourceWorkspaceClient = readRepositoryFile(sourceWorkspaceClientPath);
  const sourceWorkspaceView = readRepositoryFile(sourceWorkspaceViewPath);
  const sourceModel = readRepositoryFile(sourceModelPath);
  const sourceTestContext = readRepositoryFile(sourceTestContextPath);
  const sourceTestService = readRepositoryFile(sourceTestServicePath);
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

  it("lets Source own one compact header instead of stacking Studio navigation above it", () => {
    expect(route).toContain('studioView === "editor" ? (');
    expect(route).toContain('onExitSource={() => handleStudioViewChange("editor")}');
    expect(sourceWorkspaceView).toContain('aria-label="Return to visual editor"');
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

  it("keeps the editor dominant and reuses the installed resizable panel primitive for results", () => {
    expect(webappPackage).toContain('"react-resizable-panels": "^2.0.9"');
    expect(sourceWorkspaceView).toContain('from "react-resizable-panels"');
    expect(sourceWorkspaceView).toContain("PanelGroup");
    expect(sourceWorkspaceView).toContain("PanelResizeHandle");
    expect(sourceWorkspaceView).toContain("defaultSize={0}");
    expect(sourceWorkspaceView).toContain("collapsible");
    expect(sourceWorkspaceView).toContain('data-testid="flowcordia-source-lower-panel"');
    expect(sourceWorkspaceView).toContain('value="output"');
    expect(sourceWorkspaceView).toContain('value="logs"');
    expect(sourceWorkspaceView).toContain('value="problems"');
    expect(sourceWorkspaceView).toContain("No output yet.");
    expect(sourceWorkspaceView).toContain("No logs yet.");
    expect(sourceWorkspaceView).toContain("No problems.");
  });

  it("does not show a pretend terminal when no terminal runtime is attached", () => {
    expect(sourceWorkspaceView).not.toContain('value="terminal"');
    expect(sourceWorkspaceView).not.toContain("Terminal becomes available");
  });

  it("uses a Flowcordia file rail that is optional instead of permanently consuming editor width", () => {
    expect(sourceWorkspaceView).toContain('aria-controls="studio-v2-source-files"');
    expect(sourceWorkspaceView).toContain("aria-expanded={filesOpen}");
    expect(sourceWorkspaceView).toContain('data-testid="flowcordia-source-files"');
    expect(sourceWorkspaceView).toContain("{hasFileRail && filesOpen ? (");
    expect(sourceWorkspaceView).toContain("min-h-0 min-w-0 flex-1 overflow-hidden");
    expect(sourceWorkspaceView).not.toContain("SandpackFileExplorer");
  });

  it("reuses CodeMirror lint, search, and Source keyboard behavior for developer feedback", () => {
    expect(sourceWorkspaceView).toContain('from "@codemirror/lint"');
    expect(sourceWorkspaceView).toContain('from "@codemirror/search"');
    expect(sourceWorkspaceView).toContain("lintGutter()");
    expect(sourceWorkspaceView).toContain("search({ top: true })");
    expect(sourceWorkspaceView).toContain("keymap.of(searchKeymap)");
    expect(sourceWorkspaceView).toContain("EditorView.scrollIntoView");
    expect(sourceWorkspaceView).toContain("isSourceEditorSaveShortcut");
    expect(sourceWorkspaceView).toContain('tooltip="Save source (⌘/Ctrl+S)"');
    expect(sourceWorkspaceView).toContain('tooltip="Test source (⌘/Ctrl+Enter)"');
  });

  it("persists Source edits through the canonical durable Studio workspace", () => {
    expect(route).toContain('data-persistence="durable-local"');
    expect(sourceSurface).toContain('data-source-persistence="durable-local"');
    expect(route).toContain("studioWorkspace={workspace}");
    expect(route).toContain("onStudioWorkspaceChange={handleWorkspaceChange}");
    expect(sourceModel).toContain("createStudioV2SourceWorkspaceFromDocument");
    expect(sourceModel).toContain("applyStudioV2SourceWorkspaceToDocument");
    expect(sourceSurface).toContain('intent: "save"');
    expect(sourceSurface).toContain("expectedVersion: studioWorkspace.version");
    expect(sourceWorkspaceView).toContain('aria-label="Save workflow source"');
    expect(sourceWorkspaceView).toContain('{saving ? "Saving..." : "Save"}');
  });

  it("reuses Remix navigation guards so unsaved Source edits are not discarded silently", () => {
    expect(sourceSurface).toContain("unstable_usePrompt");
    expect(sourceSurface).toContain("useBeforeUnload");
    expect(sourceSurface).toContain("You have unsaved Source changes. Leave without saving?");
    expect(sourceSurface).toContain("currentLocation.pathname !== nextLocation.pathname");
    expect(sourceSurface).toContain('event.returnValue = ""');
  });

  it("saves dirty Source before running the isolated Trigger.dev Source test", () => {
    expect(sourceSurface).toContain("pendingTestRef.current = true");
    expect(sourceSurface).toContain('intent: "source_test"');
    expect(sourceSurface).toContain("beginTest(nextWorkspace.version)");
    expect(sourceSurface).toContain('data-source-test-runtime="trigger-dev-secure-exec"');
    expect(sourceWorkspaceView).toContain('aria-label="Test workflow source"');
  });

  it("runs Source tests in a non-promoted exact Trigger.dev worker backed by Secure Exec", () => {
    expect(route).toContain("executeStudioV2SourceTest");
    expect(sourceTestContext).toContain("executeStudioV2TypeScriptSource");
    expect(sourceTestContext).toContain('external: ["secure-exec", "@secure-exec/typescript"]');
    expect(sourceTestService).toContain("TriggerTaskService");
    expect(sourceTestService).toContain("lockToVersion: ready.deployment.version");
    expect(sourceTestService).toContain("skipPromotion: true");
    expect(sourceTestService).toContain("STUDIO_V2_SOURCE_TEST_TASK_ID");
    expect(sourceTestService).toContain("flowcordiaStudioSourceTest");
  });

  it("feeds real Source test output, run failures, and worker warming into the utility rail", () => {
    expect(sourceSurface).toContain("setOutput(sourceTest.output)");
    expect(sourceSurface).toContain("problemForSourceMessage(sourceTest.message)");
    expect(sourceSurface).toContain("SOURCE_TEST_WARMUP_RETRY_MS");
    expect(sourceSurface).toContain("Source test completed on Trigger.dev run");
    expect(sourceSurface).toContain("logs={logs}");
    expect(sourceSurface).toContain("output={output}");
  });

  it("keeps the legacy Source workspace intact as a separate implementation", () => {
    expect(legacySourceWorkspace).toContain("export function WorkflowSourceWorkspace");
    expect(sourceWorkspace).toContain("export function StudioV2SourceWorkspace");
  });
});
