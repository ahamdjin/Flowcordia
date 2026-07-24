export type FlowcordiaActionsRuntimeProfile =
  | "hosted-linux"
  | "hosted-windows"
  | "configured-small"
  | "configured-medium"
  | "configured-large"
  | "release-linux";

export interface FlowcordiaActionsRuntimeCandidate {
  version: string;
  sha: string;
}

export interface FlowcordiaActionsRuntimeStageEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-actions-runtime-stage";
  state: "READY";
  profile: FlowcordiaActionsRuntimeProfile;
  configured: boolean;
  applicationCommitSha: string;
  checkedAt: string;
  source: {
    workflow: string;
    runId: string;
    runAttempt: number;
    sourceRef: "refs/heads/main";
    sourceCommitSha: string;
  };
  runner: {
    os: string;
    arch: string;
    nameSha256: string;
  };
  toolchain: {
    node: string;
    pnpm: string;
    git: string;
  };
  cache: {
    keySha256: string;
    contentSha256: string;
    roundTrip: "VERIFIED";
  };
  candidates: {
    checkout: FlowcordiaActionsRuntimeCandidate;
    pnpmSetup: FlowcordiaActionsRuntimeCandidate;
    setupNode: FlowcordiaActionsRuntimeCandidate;
    cache: FlowcordiaActionsRuntimeCandidate;
  };
  evidenceSha256: string;
}

export interface FlowcordiaActionsRuntimeEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-actions-runtime-readiness";
  state: "READY";
  applicationCommitSha: string;
  checkedAt: string;
  source: FlowcordiaActionsRuntimeStageEvidence["source"];
  candidates: FlowcordiaActionsRuntimeStageEvidence["candidates"];
  profiles: Array<{
    profile: FlowcordiaActionsRuntimeProfile;
    configured: boolean;
    os: string;
    arch: string;
    node: string;
    pnpm: string;
    git: string;
    cacheContentSha256: string;
    stageEvidenceSha256: string;
  }>;
  evidenceSha256: string;
}

export const FLOWCORDIA_ACTIONS_RUNTIME_SCHEMA_VERSION: "0.1";
export const FLOWCORDIA_ACTIONS_RUNTIME_WORKFLOW: string;
export const FLOWCORDIA_ACTIONS_RUNTIME_CONFIRMATION: string;
export const FLOWCORDIA_ACTIONS_RUNTIME_PROFILES: FlowcordiaActionsRuntimeProfile[];
export const FLOWCORDIA_ACTIONS_RUNTIME_CANDIDATES: FlowcordiaActionsRuntimeStageEvidence["candidates"];

export function flowcordiaActionsRuntimeSha256(value: unknown): string;

export function createFlowcordiaActionsRuntimeStageEvidence(input: {
  profileName: FlowcordiaActionsRuntimeProfile;
  applicationCommitSha: string;
  runId: string;
  runAttempt: string | number;
  configured: boolean;
  runnerOs: string;
  runnerArch: string;
  runnerName: string;
  nodeVersion: string;
  pnpmVersion: string;
  gitVersion: string;
  cacheKey: string;
  cacheDigest: string;
  checkedAt: Date;
}): FlowcordiaActionsRuntimeStageEvidence;

export function parseFlowcordiaActionsRuntimeStageEvidence(
  value: unknown
): FlowcordiaActionsRuntimeStageEvidence;

export function assembleFlowcordiaActionsRuntimeEvidence(input: {
  applicationCommitSha: string;
  evidenceRoot: string;
  checkedAt?: Date;
}): Promise<FlowcordiaActionsRuntimeEvidence>;
