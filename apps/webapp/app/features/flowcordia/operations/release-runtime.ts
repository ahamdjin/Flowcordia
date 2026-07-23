import {
  FLOWCORDIA_RELEASE_NODE_VERSION,
  parseFlowcordiaReleaseDistributionManifest,
  type FlowcordiaReleaseComponentName,
} from "./release-distribution";

export const FLOWCORDIA_RELEASE_RUNTIME_SCHEMA_VERSION = "0.1" as const;

export interface FlowcordiaReleaseRuntimeIdentity {
  schemaVersion: "0.1";
  state: "READY";
  releaseId: string;
  version: string;
  component: FlowcordiaReleaseComponentName;
  applicationCommitSha: string;
  upstreamCommitSha: string;
  imageDigest: string;
  migrationCount: number;
  migrationSha256: string;
  manifestSha256: string;
}

export interface FlowcordiaReleaseRuntimeInput {
  manifest: unknown;
  component: unknown;
  applicationCommitSha: unknown;
  expectedManifestSha256: unknown;
  imageDigest: unknown;
  nodeVersion: string;
  workerEnabled: boolean;
  httpServerDisabled: boolean;
  studioEnabled: boolean;
}

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export class FlowcordiaReleaseRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaReleaseRuntimeError";
  }
}

function component(value: unknown): FlowcordiaReleaseComponentName {
  if (value !== "web" && value !== "operations_worker") {
    throw new FlowcordiaReleaseRuntimeError(
      "invalid_component",
      "Flowcordia release component is invalid."
    );
  }
  return value;
}

function applicationSha(value: unknown): string {
  if (typeof value !== "string" || !SHA.test(value) || /^([0-9a-f])\1{39}$/.test(value)) {
    throw new FlowcordiaReleaseRuntimeError(
      "invalid_application",
      "Flowcordia runtime application revision is invalid."
    );
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new FlowcordiaReleaseRuntimeError("invalid_digest", `${label} is invalid.`);
  }
  return value;
}

function validateProcessMode(input: {
  component: FlowcordiaReleaseComponentName;
  workerEnabled: boolean;
  httpServerDisabled: boolean;
  studioEnabled: boolean;
}): void {
  if (input.component === "web") {
    if (input.workerEnabled || input.httpServerDisabled) {
      throw new FlowcordiaReleaseRuntimeError(
        "invalid_web_mode",
        "Flowcordia web releases must serve HTTP with proposal operations disabled."
      );
    }
    return;
  }

  if (!input.workerEnabled || !input.httpServerDisabled || input.studioEnabled) {
    throw new FlowcordiaReleaseRuntimeError(
      "invalid_worker_mode",
      "Flowcordia operations-worker releases must disable HTTP and Studio and enable proposal operations."
    );
  }
}

export function presentFlowcordiaReleaseRuntimeIdentity(
  input: FlowcordiaReleaseRuntimeInput
): FlowcordiaReleaseRuntimeIdentity {
  const manifest = parseFlowcordiaReleaseDistributionManifest(input.manifest);
  const runtimeComponent = component(input.component);
  const runtimeApplicationSha = applicationSha(input.applicationCommitSha);
  const expectedManifestSha256 = digest(
    input.expectedManifestSha256,
    "Flowcordia expected release manifest digest"
  );
  const runtimeImageDigest = digest(input.imageDigest, "Flowcordia runtime image digest");

  if (input.nodeVersion !== FLOWCORDIA_RELEASE_NODE_VERSION) {
    throw new FlowcordiaReleaseRuntimeError(
      "runtime_mismatch",
      "Flowcordia runtime Node.js version does not match the release manifest."
    );
  }
  if (manifest.manifestSha256 !== expectedManifestSha256) {
    throw new FlowcordiaReleaseRuntimeError(
      "manifest_mismatch",
      "Flowcordia release manifest does not match the deployment digest."
    );
  }
  if (manifest.applicationCommitSha !== runtimeApplicationSha) {
    throw new FlowcordiaReleaseRuntimeError(
      "application_mismatch",
      "Flowcordia runtime application revision does not match the release manifest."
    );
  }

  const manifestComponent = manifest.components.find(
    (candidate) => candidate.name === runtimeComponent
  );
  if (!manifestComponent) {
    throw new FlowcordiaReleaseRuntimeError(
      "component_missing",
      "Flowcordia release manifest does not contain the selected component."
    );
  }
  if (
    manifest.image.digest !== runtimeImageDigest ||
    manifestComponent.imageDigest !== runtimeImageDigest ||
    manifestComponent.applicationCommitSha !== runtimeApplicationSha
  ) {
    throw new FlowcordiaReleaseRuntimeError(
      "component_mismatch",
      "Flowcordia runtime component does not match the release image and application identity."
    );
  }

  validateProcessMode({
    component: runtimeComponent,
    workerEnabled: input.workerEnabled,
    httpServerDisabled: input.httpServerDisabled,
    studioEnabled: input.studioEnabled,
  });

  return {
    schemaVersion: FLOWCORDIA_RELEASE_RUNTIME_SCHEMA_VERSION,
    state: "READY",
    releaseId: manifest.releaseId,
    version: manifest.version,
    component: runtimeComponent,
    applicationCommitSha: manifest.applicationCommitSha,
    upstreamCommitSha: manifest.upstreamCommitSha,
    imageDigest: manifest.image.digest,
    migrationCount: manifest.migrations.count,
    migrationSha256: manifest.migrations.sha256,
    manifestSha256: manifest.manifestSha256,
  };
}
