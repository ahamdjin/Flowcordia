import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(appRoot, "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function exists(relativePath: string): boolean {
  return existsSync(resolve(repositoryRoot, relativePath));
}

describe("Flowcordia Activepieces Studio integration", () => {
  it("renders the exact upstream Activepieces BuilderPage instead of composing a Flowcordia UI", () => {
    const host = read("apps/flowcordia-studio-activepieces/src/studio-host.tsx");
    expect(host).toContain('import { BuilderPage } from "@/app/builder"');
    expect(host).toContain("<BuilderPage />");
    expect(host).toContain("<ReactFlowProvider>");
    expect(host).not.toContain('from "@/app/builder/flow-canvas"');
    expect(host).not.toContain('from "@/app/builder/step-settings/code-settings/code-editor"');
    expect(host).not.toContain("WorkflowCodeView");
    expect(host).not.toContain("SelectedNodeInspector");
    expect(host).not.toContain("flowcordia-studio-shell");
  });

  it("does not substitute Activepieces visual or already-vendored service modules in Vite", () => {
    const config = read("apps/flowcordia-studio-activepieces/vite.config.mts");
    expect(config).not.toContain('find: "@/app/builder/pieces-selector"');
    expect(config).not.toContain("flowcordia-piece-selector.tsx");
    expect(config).not.toContain("flowcordiaCanvasBoundary");
    expect(config).not.toContain("activepieces-flow-canvas-upstream");
    expect(config).not.toContain("flowcordiaPieceApiBoundary");
    expect(config).not.toContain("activepieces-pieces-api.ts");
    expect(config).not.toContain("activepieces-pieces-framework-browser.ts");
    expect(config).not.toContain("activepieces-ai.ts");
    expect(config).not.toContain('find: "ai"');
    expect(config).not.toContain('find: "@/hooks/flags-hooks"');
    expect(config).not.toContain('find: "@/i18n"');
    expect(config).not.toContain('find: "./state/chat-state"');
    expect(config).toContain('find: "@activepieces/pieces-framework"');
    expect(config).toContain('pieces/framework/src/index.ts"');
    expect(config).toContain('find: "@/lib/api"');
    expect(config).toContain('find: "@/lib/authentication-session"');
  });

  it("removes retired Flowcordia-owned UI and upstream-service replacements", () => {
    for (const path of [
      "apps/flowcordia-studio-activepieces/src/flowcordia-canvas.tsx",
      "apps/flowcordia-studio-activepieces/src/flowcordia-piece-selector.tsx",
      "apps/flowcordia-studio-activepieces/src/studio-host.css",
      "apps/flowcordia-studio-activepieces/src/studio-view-switch.css",
      "apps/flowcordia-studio-activepieces/src/workflow-code-view.tsx",
      "apps/flowcordia-studio-activepieces/src/workflow-code-view.css",
      "apps/flowcordia-studio-activepieces/src/workflow-code.ts",
      "apps/flowcordia-studio-activepieces/src/workflow-code.test.ts",
      "apps/flowcordia-studio-activepieces/src/activepieces-ai.ts",
      "apps/flowcordia-studio-activepieces/src/activepieces-i18n.ts",
      "apps/flowcordia-studio-activepieces/src/activepieces-chat-state.ts",
      "apps/flowcordia-studio-activepieces/src/activepieces-pieces-api.ts",
      "apps/flowcordia-studio-activepieces/src/activepieces-pieces-framework-browser.ts",
      "apps/flowcordia-studio-activepieces/src/activepieces-piece-catalog.ts",
      "apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2ReleaseControls.tsx",
    ]) {
      expect(exists(path), path).toBe(false);
    }
  });

  it("uses the real AI SDK required by the pinned Activepieces frontend", () => {
    const packageJson = read("apps/flowcordia-studio-activepieces/package.json");
    expect(packageJson).toContain('"ai": "6.0.116"');
  });

  it("keeps only flags local and routes Activepieces piece data through the authenticated backend", () => {
    const api = read("apps/flowcordia-studio-activepieces/src/activepieces-api.ts");
    const flags = read("apps/flowcordia-studio-activepieces/src/activepieces-flags.ts");
    expect(api).toContain('url === "/v1/flags"');
    expect(api).not.toContain('url === "/v1/pieces"');
    expect(api).not.toContain('url === "/v1/pieces/registry"');
    expect(api).not.toContain('url.startsWith("/v1/pieces/")');
    expect(api).not.toContain("activepieces-piece-catalog");
    expect(api).toContain('flowcordiaActivepiecesBackendRequest<TResponse>("GET", url, query)');
    expect(api).toContain('failure.code === "activepieces_interaction_warming"');
    expect(flags).toContain('CURRENT_VERSION: "0.86.3"');
    expect(flags).not.toContain("export const flagsHooks");
  });

  it("routes non-local Activepieces API calls through the authenticated Flowcordia action", () => {
    const api = read("apps/flowcordia-studio-activepieces/src/activepieces-api.ts");
    const host = read("apps/flowcordia-studio-activepieces/src/studio-host.tsx");
    const route = read(
      "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.studio-v2/route.tsx"
    );
    expect(api).toContain("configureActivepiecesApiBackend");
    expect(api).toContain('intent: "activepieces_api"');
    expect(api).not.toContain("function currentPlatform()");
    expect(api).not.toContain("function currentProject()");
    expect(host).toContain("configureActivepiecesApiBackend(bootstrap.actionUrl)");
    expect(route).toContain("handleStudioV2ActivepiecesApi");
  });

  it("hands Trigger.dev action-test transport to Activepieces' exact test listener", () => {
    const api = read("apps/flowcordia-studio-activepieces/src/activepieces-api.ts");
    const host = read("apps/flowcordia-studio-activepieces/src/studio-host.tsx");
    const upstreamRunState = read("studio-v2/activepieces-web/src/app/builder/state/run-state.ts");
    expect(api).toContain('import type { StepRunResponse } from "@activepieces/shared"');
    expect(api).toContain("consumeActivepiecesStepRunResponse");
    expect(api).toContain('path !== "/v1/sample-data/test-step"');
    expect(host).toContain(
      "const activepiecesAddActionTestListener = store.getState().addActionTestListener"
    );
    expect(host).toContain("activepiecesAddActionTestListener({ runId, stepName })");
    expect(host).toContain("listener.onFinish(response)");
    expect(host).toContain("listener.error(");
    expect(host).not.toContain("state.updateSampleData");
    expect(host).not.toContain("state.setErrorLogs");
    expect(upstreamRunState).toContain("get().updateSampleData({");
    expect(upstreamRunState).toContain("get().setErrorLogs(");
    expect(upstreamRunState).toContain("WebsocketClientEvent.TEST_STEP_FINISHED");
  });

  it("uses Activepieces' own configured query client and theme storage contract", () => {
    const host = read("apps/flowcordia-studio-activepieces/src/studio-host.tsx");
    expect(host).toContain('import { queryClient } from "@/app/query-client"');
    expect(host).toContain("<QueryClientProvider client={queryClient}>");
    expect(host).toContain('<ThemeProvider storageKey="vite-ui-theme">');
    expect(host).not.toContain("new QueryClient(");
    expect(host).not.toContain("flowcordia-activepieces-theme");
  });

  it("loads only upstream Activepieces styling and keeps Flowcordia as persistence authority", () => {
    const main = read("apps/flowcordia-studio-activepieces/src/main.tsx");
    const host = read("apps/flowcordia-studio-activepieces/src/studio-host.tsx");
    expect(main).toContain('import "@/styles.css"');
    expect(main).not.toContain("studio-host.css");
    expect(main).not.toContain("studio-view-switch.css");
    expect(host).toContain('intent: "save"');
    expect(host).toContain("expectedVersion");
    expect(host).toContain("bootstrap.readonly");
    expect(host).toContain("flowOperations.apply");
    expect(host).toContain("activepiecesFlowToFlowcordia");
  });

  it("embeds the Activepieces-only bundle through the authenticated Flowcordia route", () => {
    const parent = read(
      "apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2ActivepiecesHost.tsx"
    );
    const route = read(
      "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.studio-v2/route.tsx"
    );
    expect(parent).toContain('src="/flowcordia-studio-activepieces/index.html"');
    expect(parent).toContain("readonly: !current.canWrite");
    expect(parent).toContain('sandbox="allow-forms allow-same-origin allow-scripts"');
    expect(parent).not.toContain("useFetcher");
    expect(parent).not.toContain(">Test<");
    expect(route).toContain("StudioV2ActivepiecesHost");
    expect(route).not.toContain("StudioV2ReleaseControls");
    expect(route).not.toContain("<NavBar>");
  });
});
