import {
  assembleFlowcordiaLaunchManifest,
  type FlowcordiaLaunchEvidenceSource,
  type FlowcordiaLaunchManifest,
  type FlowcordiaLaunchSourceIdentity,
} from "./release-launch-manifest.server";
import { flowcordiaReleaseEvidenceSha256 } from "./release-manifest.server";
import {
  FLOWCORDIA_SELF_HOST_LIFECYCLE_WORKFLOW,
  parseFlowcordiaSelfHostLifecycleEvidence,
  type FlowcordiaSelfHostLifecycleEvidence,
} from "../operations/self-host-lifecycle";

export const FLOWCORDIA_SELF_HOST_RELEASE_STAGE = "self_host_lifecycle" as const;

export interface FlowcordiaSelfHostReleaseEvidenceSource {
  stage: typeof FLOWCORDIA_SELF_HOST_RELEASE_STAGE;
  runId: string;
  runAttempt: number;
  workflowPath: string;
  workflowCommitSha: string;
  artifactName: string;
  artifactArchiveSha256: string;
  evidenceSha256: string;
  evidence: Record<string, unknown>;
}

export type FlowcordiaSelfHostLaunchEvidenceSource =
  | FlowcordiaLaunchEvidenceSource
  | FlowcordiaSelfHostReleaseEvidenceSource;

export type FlowcordiaSelfHostLaunchSourceIdentity = Omit<
  FlowcordiaLaunchSourceIdentity,
  "stage"
> & {
  stage: FlowcordiaLaunchSourceIdentity["stage"] | typeof FLOWCORDIA_SELF_HOST_RELEASE_STAGE;
};

export interface FlowcordiaSelfHostReleaseSummary {
  currentReleaseId: string;
  currentApplicationCommitSha: string;
  targetReleaseId: string;
  targetVersion: string;
  targetApplicationCommitSha: string;
  targetImageDigest: string;
  installationSha256: string;
  upgradeKind: "application_only" | "append_only_migrations";
  pendingMigrationCount: number;
  rollbackMode: "application_rollback" | "restore_required";
  recoveryRequired: boolean;
  lifecycleEvidenceSha256: string;
}

export interface FlowcordiaSelfHostLaunchManifest extends Omit<
  FlowcordiaLaunchManifest,
  "schemaVersion" | "sourceRuns" | "assembledAt" | "manifestSha256"
> {
  schemaVersion: "0.5";
  selfHost: FlowcordiaSelfHostReleaseSummary;
  sourceRuns: FlowcordiaSelfHostLaunchSourceIdentity[];
  assembledAt: string;
  manifestSha256: string;
}

export class FlowcordiaSelfHostLaunchEvidenceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaSelfHostLaunchEvidenceError";
  }
}

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const ARTIFACT = /^[A-Za-z0-9._:-]{1,512}$/;

function boundedString(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new FlowcordiaSelfHostLaunchEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 1000) {
    throw new FlowcordiaSelfHostLaunchEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return Number(value);
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) {
    throw new FlowcordiaSelfHostLaunchEvidenceError(
      "evidence_mismatch",
      `${label} does not match the exact release lineage.`
    );
  }
}

function validateSelfHostSource(input: {
  source: FlowcordiaSelfHostReleaseEvidenceSource;
  releaseId: string;
  applicationCommitSha: string;
}): {
  summary: FlowcordiaSelfHostReleaseSummary;
  identity: FlowcordiaSelfHostLaunchSourceIdentity;
  evidence: FlowcordiaSelfHostLifecycleEvidence;
} {
  const source = input.source;
  const runId = boundedString(source.runId, RUN_ID, "selfHost.runId");
  const runAttempt = positiveInteger(source.runAttempt, "selfHost.runAttempt");
  exact(source.workflowPath, FLOWCORDIA_SELF_HOST_LIFECYCLE_WORKFLOW, "selfHost.workflowPath");
  const workflowCommitSha = boundedString(
    source.workflowCommitSha,
    SHA,
    "selfHost.workflowCommitSha"
  );
  exact(workflowCommitSha, input.applicationCommitSha, "selfHost.workflowCommitSha");
  const expectedArtifact = `flowcordia-self-host-lifecycle-${runId}-${runAttempt}`;
  const artifactName = boundedString(source.artifactName, ARTIFACT, "selfHost.artifactName");
  exact(artifactName, expectedArtifact, "selfHost.artifactName");
  const artifactArchiveSha256 = boundedString(
    source.artifactArchiveSha256,
    SHA256,
    "selfHost.artifactArchiveSha256"
  );
  const evidenceSha256 = boundedString(source.evidenceSha256, SHA256, "selfHost.evidenceSha256");
  const evidence = parseFlowcordiaSelfHostLifecycleEvidence(source.evidence);
  exact(evidence.target.releaseId, input.releaseId, "selfHost.target.releaseId");
  exact(
    evidence.target.applicationCommitSha,
    input.applicationCommitSha,
    "selfHost.target.applicationCommitSha"
  );
  exact(evidence.source.runId, runId, "selfHost.source.runId");
  exact(evidence.source.runAttempt, runAttempt, "selfHost.source.runAttempt");
  exact(evidence.source.workflowPath, source.workflowPath, "selfHost.source.workflowPath");
  exact(evidence.source.sourceCommitSha, workflowCommitSha, "selfHost.source.sourceCommitSha");
  const startedAt = evidence.phases[0]?.observedAt;
  if (!startedAt) {
    throw new FlowcordiaSelfHostLaunchEvidenceError(
      "invalid_evidence",
      "Self-host lifecycle evidence has no observed phases."
    );
  }

  return {
    summary: {
      currentReleaseId: evidence.current.releaseId,
      currentApplicationCommitSha: evidence.current.applicationCommitSha,
      targetReleaseId: evidence.target.releaseId,
      targetVersion: evidence.target.version,
      targetApplicationCommitSha: evidence.target.applicationCommitSha,
      targetImageDigest: evidence.target.imageDigest,
      installationSha256: evidence.installation.installationSha256,
      upgradeKind: evidence.upgrade.kind,
      pendingMigrationCount: evidence.upgrade.pendingMigrationCount,
      rollbackMode: evidence.rollback.mode,
      recoveryRequired: evidence.rollback.recoveryRequired,
      lifecycleEvidenceSha256: evidence.evidenceSha256,
    },
    identity: {
      stage: FLOWCORDIA_SELF_HOST_RELEASE_STAGE,
      runId,
      runAttempt,
      workflowPath: source.workflowPath,
      workflowCommitSha,
      artifactName,
      artifactArchiveSha256,
      evidenceSha256,
      startedAt,
      completedAt: evidence.checkedAt,
    },
    evidence,
  };
}

export function assembleFlowcordiaSelfHostLaunchManifest(input: {
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
  proposalId: string;
  assembledAt: string;
  sources: readonly FlowcordiaSelfHostLaunchEvidenceSource[];
}): FlowcordiaSelfHostLaunchManifest {
  if (input.sources.length !== 9) {
    throw new FlowcordiaSelfHostLaunchEvidenceError(
      "missing_stage",
      "Launch evidence requires exactly nine source artifacts."
    );
  }
  const lifecycleSources = input.sources.filter(
    (source): source is FlowcordiaSelfHostReleaseEvidenceSource =>
      source.stage === FLOWCORDIA_SELF_HOST_RELEASE_STAGE
  );
  if (lifecycleSources.length !== 1) {
    throw new FlowcordiaSelfHostLaunchEvidenceError(
      "missing_stage",
      "Launch evidence requires exactly one published self-host lifecycle artifact."
    );
  }
  const launchSources = input.sources.filter(
    (source): source is FlowcordiaLaunchEvidenceSource =>
      source.stage !== FLOWCORDIA_SELF_HOST_RELEASE_STAGE
  );
  const base = assembleFlowcordiaLaunchManifest({
    releaseId: input.releaseId,
    applicationCommitSha: input.applicationCommitSha,
    workflowId: input.workflowId,
    proposalId: input.proposalId,
    assembledAt: input.assembledAt,
    sources: launchSources,
  });
  const lifecycle = validateSelfHostSource({
    source: lifecycleSources[0]!,
    releaseId: input.releaseId,
    applicationCommitSha: input.applicationCommitSha,
  });
  if (new Set(input.sources.map((source) => source.runId)).size !== input.sources.length) {
    throw new FlowcordiaSelfHostLaunchEvidenceError(
      "evidence_mismatch",
      "Every launch evidence stage must come from a distinct workflow run."
    );
  }
  const provider = base.sourceRuns.find((source) => source.stage === "provider");
  if (!provider) {
    throw new FlowcordiaSelfHostLaunchEvidenceError(
      "missing_stage",
      "Launch evidence is missing provider readiness."
    );
  }
  if (Date.parse(lifecycle.identity.completedAt) > Date.parse(provider.startedAt)) {
    throw new FlowcordiaSelfHostLaunchEvidenceError(
      "evidence_mismatch",
      "Provider readiness started before self-host lifecycle acceptance completed."
    );
  }
  if (Date.parse(lifecycle.identity.completedAt) > Date.parse(base.assembledAt)) {
    throw new FlowcordiaSelfHostLaunchEvidenceError(
      "invalid_input",
      "Launch manifest assembly precedes self-host lifecycle completion."
    );
  }

  const sourceRuns: FlowcordiaSelfHostLaunchSourceIdentity[] = [
    lifecycle.identity,
    ...base.sourceRuns,
  ];
  const { manifestSha256: _baseDigest, schemaVersion: _baseSchema, ...baseWithoutDigest } = base;
  const withoutDigest = {
    ...baseWithoutDigest,
    schemaVersion: "0.5" as const,
    selfHost: lifecycle.summary,
    sourceRuns,
  };
  return {
    ...withoutDigest,
    manifestSha256: flowcordiaReleaseEvidenceSha256(withoutDigest),
  };
}
