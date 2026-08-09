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
    expect(route).toContain('handleStudioViewChange("source")');
    expect(route).toContain('handleStudioViewChange("editor")');
    expect(route).toContain("studioV2SearchParamsForView(searchParams, view)");
    expect(route).toContain("StudioV2ActivepiecesHost");
    expect(route).toContain("StudioV2SourceSurface");
    expect(route).toContain("onExitStudio");
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

  it("pins Sandpack and uses its public workspace, file explorer, and editor primitives", () => {
    expect(webappPackage).toContain('"@codesandbox/sandpack-react": "2.20.0"');
    expect(sourceWorkspace).not.toContain("@codesandbox/sandpack-react");
    expect(sourceModel).not.toContain("@codesandbox/sandpack-react");
    expect(sourceWorkspaceView).not.toContain("@codesandbox/sandpack-react");

    expect(sourceWorkspaceClient).toContain('from "@codesandbox/sandpack-react"');
    expect(sourceWorkspaceClient).not.toContain("@codesandbox/sandpack-react/");
    expect(sourceWorkspaceClient).toContain("SandpackProvider");
    expect(sourceWorkspaceClient).toContain("useSandpack");
    expect(sourceWorkspaceClient).toContain("SandpackLayout");
    expect(sourceWorkspaceClient).toContain("SandpackFileExplorer");
    expect(sourceWorkspaceClient).toContain("SandpackCodeEditor");
    expect(sourceWorkspaceClient).toContain("showRunButton={false}");
    expect(sourceWorkspaceClient).not.toContain("SandpackPreview");

    expect(sourceWorkspaceView).toContain("renderEditor");
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

  it("reuses the Query workspace shell and shared splitters for editor, results, and tools", () => {
    expect(webappPackage).toContain('"@window-splitter/react": "1.1.3"');
    expect(sourceWorkspaceView).toContain('from "~/components/primitives/Resizable"');
    expect(sourceWorkspaceView).toContain("PageContainer");
    expect(sourceWorkspaceView).toContain("PageBody");
    expect(sourceWorkspaceView).toContain('orientation="horizontal"');
    expect(sourceWorkspaceView).toContain('orientation="vertical"');
    expect(sourceWorkspaceView).toContain('id="source-editor"');
    expect(sourceWorkspaceView).toContain('id="source-results"');
    expect(sourceWorkspaceView).toContain('id="source-utility"');
    expect(sourceWorkspaceView).toContain('data-testid="flowcordia-source-lower-panel"');
    expect(sourceWorkspaceView).toContain('value="output"');
    expect(sourceWorkspaceView).toContain('value="logs"');
    expect(sourceWorkspaceView).toContain('value="problems"');
    expect(sourceWorkspaceView).toContain("hasActionableProblems");
    expect(sourceWorkspaceView).toContain("Run the workflow to inspect its output.");
    expect(sourceWorkspaceView).toContain("No logs yet.");
    expect(sourceWorkspaceView).toContain("No problems.");
  });

  it("does not show a pretend terminal when no terminal runtime is attached", () => {
    expect(sourceWorkspaceView).not.toContain('value="terminal"');
    expect(sourceWorkspaceView).not.toContain("Terminal becomes available");
  });

  it("keeps test input, runtime context, and dependencies in the Query-style utility panel", () => {
    expect(sourceWorkspaceView).toContain('value="input"');
    expect(sourceWorkspaceView).toContain('value="context"');
    expect(sourceWorkspaceView).toContain('value="packages"');
    expect(sourceWorkspaceView).toContain("Test payload");
    expect(sourceWorkspaceView).toContain("ctx.input");
    expect(sourceWorkspaceView).toContain("ctx.steps");
    expect(sourceWorkspaceView).toContain("ctx.variables");
    expect(sourceWorkspaceView).toContain("ctx.credentials");
    expect(sourceWorkspaceView).toContain('data-testid="flowcordia-source-packages"');
    expect(sourceWorkspaceView).toContain("Dependencies");
    expect(sourceWorkspaceView).not.toContain("SandpackFileExplorer");
    expect(sourceWorkspaceClient).toContain("SandpackFileExplorer");
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
    expect(sourceWorkspaceView).toContain('tooltip="Test workflow (Cmd/Ctrl+Enter)"');
  });

  it("persists Source edits through the canonical durable Studio workspace", () => {
    expect(route).toContain('"data-persistence": "durable-local"');
    expect(sourceSurface).toContain('data-source-persistence="durable-local"');
    expect(route).toContain("studioWorkspace={workspace}");
    expect(route).toContain("onStudioWorkspaceChange={handleWorkspaceChange}");
    expect(sourceModel).toContain("createStudioV2SourceWorkspaceFromDocument");
    expect(sourceModel).toContain("applyStudioV2SourceWorkspaceToDocument");
    expect(sourceSurface).toContain("dirty={dirty}");
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

  it("saves dirty Source before running the shared workflow test", () => {
    expect(sourceSurface).toContain("pendingTestRef.current = true");
    expect(sourceSurface).toContain('intent: "test"');
    expect(sourceSurface).toContain("beginTest(nextWorkspace.version)");
    expect(sourceSurface).toContain('data-source-test-runtime="flowcordia-workflow-runtime"');
    expect(sourceWorkspaceView).toContain('aria-label="Test workflow"');
  });

  it("runs Source tests in a non-promoted reusable Trigger.dev worker backed by Secure Exec", () => {
    expect(route).toContain("executeStudioV2SourceTest");
    expect(sourceTestContext).toContain("executeStudioV2TypeScriptSource");
    expect(sourceTestContext).toContain('external: ["secure-exec", "@secure-exec/typescript"]');
    expect(sourceTestService).toContain("TriggerTaskService");
    expect(sourceTestService).toContain("connectedDevelopmentSourceTestWorker");
    expect(sourceTestService).toContain('environment.type === "DEVELOPMENT"');
    expect(sourceTestService).toContain("executionVersion: connectedWorker.version");
    expect(sourceTestService).toContain("lockToVersion: ready.executionVersion");
    expect(sourceTestService).toContain("skipPromotion: true");
    expect(sourceTestService).toContain("STUDIO_V2_SOURCE_TEST_TASK_ID");
    expect(sourceTestService).toContain("flowcordiaStudioSourceTest");
    expect(sourceTestService).toContain("runnerVersion: STUDIO_V2_SOURCE_TEST_RUNNER_VERSION");
    expect(sourceTestService).not.toContain("document: input.document");
    expect(sourceTestService).toContain("document: ready.source.document");
    expect(sourceTestService).toContain('typeof parsedValue === "string"');
    expect(sourceTestService).toContain("JSON.parse(parsedValue)");
    expect(sourceTestContext).toContain("document: payload.document");
  });

  it("offers explicit recovery when Source and Editor change the same node", () => {
    expect(sourceSurface).toContain("reloadLatestSource");
    expect(sourceSurface).toContain("keepLocalSourceDraft");
    expect(sourceSurface).toContain("onReloadLatest: reloadLatestSource");
    expect(sourceSurface).toContain("onKeepLocalDraft: keepLocalSourceDraft");
    expect(sourceWorkspaceView).toContain('data-testid="flowcordia-source-conflict"');
    expect(sourceWorkspaceView).toContain("Reload latest");
    expect(sourceWorkspaceView).toContain("Keep my draft");
  });

  it("feeds full workflow output, per-node traces, and failures into the utility rail", () => {
    expect(sourceSurface).toContain(
      "setOutput({ output: execution.output, traces: execution.traces })"
    );
    expect(sourceSurface).toContain("failedTrace?.message");
    expect(sourceSurface).toContain("Flowcordia test runtime");
    expect(sourceSurface).toContain("trace.status.toLowerCase()");
    expect(sourceSurface).toContain("logs={logs}");
    expect(sourceSurface).toContain("output={output}");
  });

  it("keeps the legacy Source workspace intact as a separate implementation", () => {
    expect(legacySourceWorkspace).toContain("export function WorkflowSourceWorkspace");
    expect(sourceWorkspace).toContain("export function StudioV2SourceWorkspace");
  });
});
