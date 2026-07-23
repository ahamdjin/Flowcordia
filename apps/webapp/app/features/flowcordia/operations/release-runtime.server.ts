import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { logger } from "~/services/logger.server";
import {
  FlowcordiaReleaseRuntimeError,
  presentFlowcordiaReleaseRuntimeIdentity,
  type FlowcordiaReleaseRuntimeIdentity,
} from "./release-runtime";

const MAXIMUM_MANIFEST_BYTES = 64 * 1024;

let runtimeIdentity: FlowcordiaReleaseRuntimeIdentity | undefined;
let initialized = false;

export interface FlowcordiaReleaseRuntimeEnvironment {
  FLOWCORDIA_RELEASE_RUNTIME_REQUIRED?: string;
  FLOWCORDIA_RELEASE_MANIFEST_PATH?: string;
  FLOWCORDIA_RELEASE_MANIFEST_SHA256?: string;
  FLOWCORDIA_RELEASE_COMPONENT?: string;
  FLOWCORDIA_APPLICATION_COMMIT_SHA?: string;
  FLOWCORDIA_IMAGE_DIGEST?: string;
  FLOWCORDIA_PROPOSAL_WORKER_ENABLED?: string;
  FLOWCORDIA_STUDIO_ENABLED?: string;
  HTTP_SERVER_DISABLED?: string;
}

function requiredMode(environment: FlowcordiaReleaseRuntimeEnvironment): boolean {
  const value = environment.FLOWCORDIA_RELEASE_RUNTIME_REQUIRED ?? "0";
  if (value !== "0" && value !== "1") {
    throw new FlowcordiaReleaseRuntimeError(
      "invalid_enforcement",
      "Flowcordia release runtime enforcement must be 0 or 1."
    );
  }
  return value === "1";
}

function manifestPath(environment: FlowcordiaReleaseRuntimeEnvironment): string {
  const value = environment.FLOWCORDIA_RELEASE_MANIFEST_PATH;
  if (!value || value.length > 4096 || !isAbsolute(value)) {
    throw new FlowcordiaReleaseRuntimeError(
      "invalid_manifest_path",
      "Flowcordia release manifest path must be an absolute bounded path."
    );
  }
  return value;
}

function readManifest(path: string): unknown {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 2 || stat.size > MAXIMUM_MANIFEST_BYTES) {
      throw new FlowcordiaReleaseRuntimeError(
        "invalid_manifest_file",
        "Flowcordia release manifest must be one bounded regular file."
      );
    }
    const bytes = readFileSync(descriptor);
    if (bytes.byteLength !== stat.size || bytes.byteLength > MAXIMUM_MANIFEST_BYTES) {
      throw new FlowcordiaReleaseRuntimeError(
        "manifest_changed",
        "Flowcordia release manifest changed while it was being read."
      );
    }
    try {
      return JSON.parse(bytes.toString("utf8")) as unknown;
    } catch {
      throw new FlowcordiaReleaseRuntimeError(
        "invalid_manifest_json",
        "Flowcordia release manifest is not valid JSON."
      );
    }
  } catch (error) {
    if (error instanceof FlowcordiaReleaseRuntimeError) throw error;
    throw new FlowcordiaReleaseRuntimeError(
      "manifest_unavailable",
      "Flowcordia release manifest is unavailable."
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function currentReleaseRuntimeEnvironment(): FlowcordiaReleaseRuntimeEnvironment {
  return {
    FLOWCORDIA_RELEASE_RUNTIME_REQUIRED: process.env.FLOWCORDIA_RELEASE_RUNTIME_REQUIRED,
    FLOWCORDIA_RELEASE_MANIFEST_PATH: process.env.FLOWCORDIA_RELEASE_MANIFEST_PATH,
    FLOWCORDIA_RELEASE_MANIFEST_SHA256: process.env.FLOWCORDIA_RELEASE_MANIFEST_SHA256,
    FLOWCORDIA_RELEASE_COMPONENT: process.env.FLOWCORDIA_RELEASE_COMPONENT,
    FLOWCORDIA_APPLICATION_COMMIT_SHA: process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA,
    FLOWCORDIA_IMAGE_DIGEST: process.env.FLOWCORDIA_IMAGE_DIGEST,
    FLOWCORDIA_PROPOSAL_WORKER_ENABLED: process.env.FLOWCORDIA_PROPOSAL_WORKER_ENABLED,
    FLOWCORDIA_STUDIO_ENABLED: process.env.FLOWCORDIA_STUDIO_ENABLED,
    HTTP_SERVER_DISABLED: process.env.HTTP_SERVER_DISABLED,
  };
}

export function loadFlowcordiaReleaseRuntimeIdentity(input: {
  environment: FlowcordiaReleaseRuntimeEnvironment;
  nodeVersion: string;
}): FlowcordiaReleaseRuntimeIdentity | undefined {
  if (!requiredMode(input.environment)) return undefined;

  return presentFlowcordiaReleaseRuntimeIdentity({
    manifest: readManifest(manifestPath(input.environment)),
    component: input.environment.FLOWCORDIA_RELEASE_COMPONENT,
    applicationCommitSha: input.environment.FLOWCORDIA_APPLICATION_COMMIT_SHA,
    expectedManifestSha256: input.environment.FLOWCORDIA_RELEASE_MANIFEST_SHA256,
    imageDigest: input.environment.FLOWCORDIA_IMAGE_DIGEST,
    nodeVersion: input.nodeVersion,
    workerEnabled: input.environment.FLOWCORDIA_PROPOSAL_WORKER_ENABLED === "1",
    httpServerDisabled: input.environment.HTTP_SERVER_DISABLED === "true",
    studioEnabled: input.environment.FLOWCORDIA_STUDIO_ENABLED === "1",
  });
}

export function initializeFlowcordiaReleaseRuntimeIdentity():
  | FlowcordiaReleaseRuntimeIdentity
  | undefined {
  if (initialized) return runtimeIdentity;
  initialized = true;

  try {
    runtimeIdentity = loadFlowcordiaReleaseRuntimeIdentity({
      environment: currentReleaseRuntimeEnvironment(),
      nodeVersion: process.versions.node,
    });
    if (runtimeIdentity) {
      logger.info("Flowcordia release runtime identity verified", {
        releaseId: runtimeIdentity.releaseId,
        version: runtimeIdentity.version,
        component: runtimeIdentity.component,
        applicationCommitSha: runtimeIdentity.applicationCommitSha,
        imageDigest: runtimeIdentity.imageDigest,
        manifestSha256: runtimeIdentity.manifestSha256,
      });
    }
    return runtimeIdentity;
  } catch (error) {
    logger.error("Flowcordia release runtime identity is blocked", {
      code:
        error instanceof FlowcordiaReleaseRuntimeError ? error.code : "release_runtime_unavailable",
    });
    throw error;
  }
}

export function assertFlowcordiaReleaseRuntimeIdentity():
  | FlowcordiaReleaseRuntimeIdentity
  | undefined {
  const identity = initializeFlowcordiaReleaseRuntimeIdentity();
  if (process.env.FLOWCORDIA_RELEASE_RUNTIME_REQUIRED === "1" && !identity) {
    throw new FlowcordiaReleaseRuntimeError(
      "release_runtime_unavailable",
      "Flowcordia release runtime identity is unavailable."
    );
  }
  return identity;
}
