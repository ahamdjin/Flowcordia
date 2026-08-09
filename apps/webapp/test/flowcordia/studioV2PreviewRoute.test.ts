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
const adapterHostPath = "apps/flowcordia-studio-activepieces/src/studio-host.tsx";
const bridgePath = "apps/flowcordia-studio-activepieces/src/flowcordia-activepieces-bridge.ts";
const deploymentServicePath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/native-deployment-service.server.ts";
const serverPath = "apps/webapp/server.ts";

describe("Flowcordia Studio V2 route", () => {
  const route = readRepositoryFile(routePath);
  const host = readRepositoryFile(hostPath);
  const adapterHost = readRepositoryFile(adapterHostPath);
  const bridge = readRepositoryFile(bridgePath);
  const deploymentService = readRepositoryFile(deploymentServicePath);
  const server = readRepositoryFile(serverPath);

  it("keeps Activepieces BuilderPage as the visual workflow surface", () => {
    expect(route).toContain("loadOrCreateStudioV2Workspace");
    expect(route).toContain("StudioV2ActivepiecesHost");
    expect(route).toContain("StudioV2SourceSurface");
    expect(route).not.toContain("StudioV2Surface");
    expect(route).not.toContain("StudioV2ReleaseControls");
    expect(route).not.toContain("<NavBar>");
    expect(route).not.toContain("<Badge");
    expect(route).toContain('"data-testid": "flowcordia-studio-v2-preview-route"');
    expect(route).toContain('"data-studio-foundation": "activepieces"');
    expect(route).toContain("StudioV2WorkflowLibrary");
    expect(route).toContain('data-studio-view="library"');
    expect(adapterHost).toContain('import { BuilderPage } from "@/app/builder"');
    expect(adapterHost).toContain("<BuilderPage />");
    expect(adapterHost).not.toContain('from "@/app/builder/flow-canvas"');
    expect(adapterHost).not.toContain("WorkflowCodeView");
  });

  it("uses Flowcordia permissions rather than Activepieces or GitHub authorization", () => {
    expect(route).toContain('ability.can("write", { type: "envvars"');
    expect(route).not.toContain('resource: { type: "github" }');
    expect(route).not.toContain("resolveControlPlaneScope");
    expect(host).toContain("readonly: !current.canWrite");
    expect(host).toContain("event.origin !== window.location.origin");
    expect(host).toContain("event.source !== iframeRef.current?.contentWindow");
  });

  it("converts Activepieces operations back into the canonical Flowcordia workflow", () => {
    expect(adapterHost).toContain("flowOperations.apply");
    expect(adapterHost).toContain("activepiecesFlowToFlowcordia");
    expect(adapterHost).toContain('intent: "save"');
    expect(bridge).toContain("flowcordiaWorkflowToActivepieces");
    expect(bridge).toContain("activepiecesFlowToFlowcordia");
    expect(bridge).toContain("FLOWCORDIA_BACKUP_FILE");
  });

  it("keeps test, stage, deploy, and rollback behind the UI adapter boundary", () => {
    expect(route).toContain("saveStudioV2Workspace");
    expect(route).toContain("startStudioV2WorkflowTest");
    expect(route).toContain("readStudioV2WorkflowTest");
    expect(route).toContain("cancelStudioV2WorkflowTest");
    expect(route).toContain("stageStudioV2Workspace");
    expect(route).toContain("deployStudioV2Release");
    expect(route).toContain("rollbackStudioV2Release");
    expect(route).toContain("StudioV2LifecycleBar");
    expect(host).not.toContain('intent: "test"');
    expect(route).toContain('command.intent === "stage"');
    expect(route).toContain('command.intent === "deploy"');
    expect(route).toContain('command.intent === "rollback"');
    expect(route).toContain('command.intent === "repository_pull"');
    expect(route).toContain('command.intent === "repository_push"');
    expect(route).toContain('command.intent === "repository_sync"');
  });

  it("blocks view and lifecycle changes while the visual editor is saving", () => {
    expect(adapterHost).toContain('postToParent({ type: "saving", saving: true })');
    expect(adapterHost).toContain('postToParent({ type: "saving", saving: false })');
    expect(host).toContain('event.data.type === "saving"');
    expect(route).toContain("editorSaving={editorSaving}");
    expect(route).toContain("disabled={editorSaving}");
  });

  it("uploads one immutable release and initializes the existing Trigger.dev native build", () => {
    expect(deploymentService).toContain("ArtifactsService");
    expect(deploymentService).toContain("InitializeDeploymentService");
    expect(deploymentService).toContain("isNativeBuild: true");
    expect(deploymentService).toContain('initialStatus: "PENDING"');
    expect(deploymentService).toContain('triggeredVia: "dashboard"');
    expect(deploymentService).toContain("release.sourceSha256");
    expect(deploymentService).toContain("attachStudioV2ReleaseDeployment");
    expect(deploymentService).toContain("failStudioV2ReleaseDeployment");
    expect(deploymentService).not.toContain("github");
  });

  it("rate limits the uncached Studio shell before reading it from disk", () => {
    expect(server).toContain('import { rateLimit } from "express-rate-limit"');
    expect(server).toContain("const studioAssetRateLimiter = rateLimit({");
    expect(server).toContain("studioAssetRateLimiter,");
    expect(server.indexOf("studioAssetRateLimiter,")).toBeLessThan(server.indexOf("res.sendFile("));
  });
});
