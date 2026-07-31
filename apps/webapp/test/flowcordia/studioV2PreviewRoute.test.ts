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
const bridgePath =
  "apps/flowcordia-studio-activepieces/src/flowcordia-activepieces-bridge.ts";
const releaseControlsPath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2ReleaseControls.tsx";
const deploymentServicePath =
  "apps/webapp/app/features/flowcordia/workflows/studio-v2/native-deployment-service.server.ts";

describe("Flowcordia Studio V2 route", () => {
  const route = readRepositoryFile(routePath);
  const host = readRepositoryFile(hostPath);
  const adapterHost = readRepositoryFile(adapterHostPath);
  const bridge = readRepositoryFile(bridgePath);
  const releaseControls = readRepositoryFile(releaseControlsPath);
  const deploymentService = readRepositoryFile(deploymentServicePath);

  it("mounts the genuine Activepieces builder inside the Flowcordia project layout", () => {
    expect(route).toContain("loadOrCreateStudioV2Workspace");
    expect(route).toContain("loadLatestStudioV2Release");
    expect(route).toContain("StudioV2ReleaseControls");
    expect(route).toContain("StudioV2ActivepiecesHost");
    expect(route).not.toContain("StudioV2Surface");
    expect(route).toContain('data-testid="flowcordia-studio-v2-preview-route"');
    expect(route).toContain('data-studio-foundation="activepieces"');
    expect(adapterHost).toContain('from "@/app/builder/flow-canvas"');
    expect(adapterHost).toContain('from "@/app/builder/step-settings/code-settings/code-editor"');
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

  it("preserves save, test, immutable staging, and real deployment controls", () => {
    expect(route).toContain("saveStudioV2Workspace");
    expect(route).toContain("structurallyTestStudioV2Workspace");
    expect(route).toContain("stageStudioV2Workspace");
    expect(route).toContain("deployStudioV2Release");
    expect(host).toContain('intent: "test"');
    expect(releaseControls).toContain('intent: "stage"');
    expect(releaseControls).toContain('intent: "deploy"');
    expect(releaseControls).toContain("releasePublicId: release.publicId");
    expect(releaseControls).toContain("revalidator.revalidate()");
    expect(releaseControls).toContain('encType: "application/json"');
    expect(releaseControls).toContain("expectedVersion: workspace.version");
  });

  it("uploads one immutable release and initializes the existing Trigger.dev native build", () => {
    expect(deploymentService).toContain("ArtifactsService");
    expect(deploymentService).toContain("InitializeDeploymentService");
    expect(deploymentService).toContain('isNativeBuild: true');
    expect(deploymentService).toContain('initialStatus: "PENDING"');
    expect(deploymentService).toContain('triggeredVia: "dashboard"');
    expect(deploymentService).toContain("release.sourceSha256");
    expect(deploymentService).toContain("attachStudioV2ReleaseDeployment");
    expect(deploymentService).toContain("failStudioV2ReleaseDeployment");
    expect(deploymentService).not.toContain("github");
  });
});
