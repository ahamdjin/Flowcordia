import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(appRoot, "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("Flowcordia Activepieces Studio integration", () => {
  it("boots the genuine Activepieces canvas, builder store and CodeMirror editor", () => {
    const host = read("apps/flowcordia-studio-activepieces/src/studio-host.tsx");
    expect(host).toContain('from "@/app/builder/flow-canvas"');
    expect(host).toContain('from "@/app/builder/builder-hooks"');
    expect(host).toContain(
      'from "@/app/builder/step-settings/code-settings/code-editor"'
    );
    expect(host).not.toMatch(/<ReactFlow(?:\s|>)/);
  });

  it("replaces Activepieces backend piece discovery with the Flowcordia node catalog", () => {
    const config = read("apps/flowcordia-studio-activepieces/vite.config.mts");
    const selector = read(
      "apps/flowcordia-studio-activepieces/src/flowcordia-piece-selector.tsx"
    );
    expect(config).toContain('find: "@/app/builder/pieces-selector"');
    expect(config).toContain("flowcordia-piece-selector.tsx");
    expect(selector).toContain("state.handleAddingOrUpdatingStep");
    expect(selector).toContain('title: "Source"');
    expect(selector).toContain('title: "HTTP Request"');
    expect(selector).toContain('title: "Condition"');
    expect(selector).toContain("function run(ctx: FlowcordiaContext)");
  });

  it("keeps Canvas and whole-workflow Code on one canonical Flowcordia document", () => {
    const host = read("apps/flowcordia-studio-activepieces/src/studio-host.tsx");
    const codeView = read(
      "apps/flowcordia-studio-activepieces/src/workflow-code-view.tsx"
    );
    const parser = read("apps/flowcordia-studio-activepieces/src/workflow-code.ts");
    expect(host).toContain("<WorkflowCodeView");
    expect(host).toContain('setView("code")');
    expect(host).toContain("replaceWorkflow(workflow: WorkflowDefinition)");
    expect(codeView).toContain("Last valid canvas preserved");
    expect(codeView).toContain("Open node settings");
    expect(parser).toContain("ts.createSourceFile");
    expect(parser).toContain("validateWorkflow(value)");
    expect(parser).not.toContain("eval(");
    expect(parser).not.toContain("new Function");
  });

  it("loads upstream Activepieces styling and keeps Flowcordia as the persistence authority", () => {
    const main = read("apps/flowcordia-studio-activepieces/src/main.tsx");
    const host = read("apps/flowcordia-studio-activepieces/src/studio-host.tsx");
    expect(main).toContain('import "@/styles.css"');
    expect(host).toContain('intent: "save"');
    expect(host).toContain("expectedVersion");
    expect(host).toContain("bootstrap.readonly");
  });

  it("embeds the isolated bundle through the authenticated Flowcordia route", () => {
    const parent = read(
      "apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2ActivepiecesHost.tsx"
    );
    expect(parent).toContain('src="/flowcordia-studio-activepieces/index.html"');
    expect(parent).toContain("readonly: !current.canWrite");
    expect(parent).toContain('sandbox="allow-forms allow-same-origin allow-scripts"');
  });
});