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

  it("does not substitute Activepieces visual components in Vite", () => {
    const config = read("apps/flowcordia-studio-activepieces/vite.config.mts");
    expect(config).not.toContain('find: "@/app/builder/pieces-selector"');
    expect(config).not.toContain("flowcordia-piece-selector.tsx");
    expect(config).not.toContain("flowcordiaCanvasBoundary");
    expect(config).not.toContain("activepieces-flow-canvas-upstream");
    expect(config).toContain("flowcordiaPieceApiBoundary");
    expect(config).toContain('find: "@/lib/api"');
    expect(config).toContain('find: "@/lib/authentication-session"');
  });

  it("removes the retired Flowcordia-owned Studio UI and code editor surfaces", () => {
    for (const path of [
      "apps/flowcordia-studio-activepieces/src/flowcordia-canvas.tsx",
      "apps/flowcordia-studio-activepieces/src/flowcordia-piece-selector.tsx",
      "apps/flowcordia-studio-activepieces/src/studio-host.css",
      "apps/flowcordia-studio-activepieces/src/studio-view-switch.css",
      "apps/flowcordia-studio-activepieces/src/workflow-code-view.tsx",
      "apps/flowcordia-studio-activepieces/src/workflow-code-view.css",
      "apps/flowcordia-studio-activepieces/src/workflow-code.ts",
      "apps/flowcordia-studio-activepieces/src/workflow-code.test.ts",
      "apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2ReleaseControls.tsx",
    ]) {
      expect(exists(path), path).toBe(false);
    }
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
