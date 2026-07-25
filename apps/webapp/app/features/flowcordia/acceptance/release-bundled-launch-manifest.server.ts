import {
  FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW,
  parseFlowcordiaBundledCleanInstallEvidence,
  type FlowcordiaBundledCleanInstallEvidence,
} from "../operations/bundled-clean-install";
import { flowcordiaReleaseEvidenceSha256 } from "./release-manifest.server";
import {
  assembleFlowcordiaSelfHostLaunchManifest,
  type FlowcordiaSelfHostLaunchEvidenceSource,
  type FlowcordiaSelfHostLaunchManifest,
  type FlowcordiaSelfHostLaunchSourceIdentity,
} from "./release-self-host-launch-manifest.server";

export const FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE = "bundled_clean_install" as const;

export interface FlowcordiaBundledCleanInstallEvidenceSource {
  stage: typeof FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE;
  runId: string;
  runAttempt: number;
  workflowPath: string;
  workflowCommitSha: string;
  artifactName: string;
  artifactArchiveSha256: string;
  evidenceSha256: string;
  evidence: Record<string, unknown>;
}

export type FlowcordiaBundledLaunchEvidenceSource =
  | FlowcordiaSelfHostLaunchEvidenceSource
  | FlowcordiaBundledCleanInstallEvidenceSource;

export type FlowcordiaBundledLaunchSourceIdentity = Omit<
  FlowcordiaSelfHostLaunchSourceIdentity,
  "stage"
> & {
  stage:
    | FlowcordiaSelfHostLaunchSourceIdentity["stage"]
    | typeof FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE;
};

export interface FlowcordiaBundledReleaseSummary {
  publicationRunId: string;
  compatibilityVersion: number;
  applicationManifestSha256: string;
  applicationImageDigest: string;
  bundledManifestSha256: string;
  cleanInstallEvidenceSha256: string;
}

export interface FlowcordiaBundledLaunchManifest extends Omit<
  FlowcordiaSelfHostLaunchManifest,
  "schemaVersion" | "sourceRuns" | "assembledAt" | "manifestSha256"
> {
  schemaVersion: "0.6";
  bundledSelfHost: FlowcordiaBundledReleaseSummary;
  sourceRuns: FlowcordiaBundledLaunchSourceIdentity[];
  assembledAt: string;
  manifestSha256: string;
}

export class FlowcordiaBundledLaunchEvidenceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaBundledLaunchEvidenceError";
  }
}

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const ARTIFACT = /^[A-Za-z0-9._:-]{1,512}$/;

function bounded(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new FlowcordiaBundledLaunchEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 1_000) {
    throw new FlowcordiaBundledLaunchEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return Number(value);
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) {
    throw new FlowcordiaBundledLaunchEvidenceError(
      "evidence_mismatch",
      `${label} does not match the exact bundled release lineage.`
    );
  }
}

function validateBundledSource(input: {
  source: FlowcordiaBundledCleanInstallEvidenceSource;
  releaseId: string;
  applicationCommitSha: string;
  targetImageDigest: string;
}): {
  summary: FlowcordiaBundledReleaseSummary;
  identity: FlowcordiaBundledLaunchSourceIdentity;
  evidence: FlowcordiaBundledCleanInstallEvidence;
} {
  const source = input.source;
  const runId = bounded(source.runId, RUN_ID, "bundled.runId");
  const runAttempt = positiveInteger(source.runAttempt, "bundled.runAttempt");
  exact(source.workflowPath, FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW, "bundled.workflowPath");
  const workflowCommitSha = bounded(
    source.workflowCommitSha,
    SHA,
    "bundled.workflowCommitSha"
  );
  exact(workflowCommitSha, input.applicationCommitSha, "bundled.workflowCommitSha");
  const artifactName = bounded(source.artifactName, ARTIFACT, "bundled.artifactName");
  exact(
    artifactName,
    `flowcordia-bundled-clean-install-${runId}-${runAttempt}`,
    "bundled.artifactName"
  );
  const artifactArchiveSha256 = bounded(
    source.artifactArchiveSha256,
    SHA256,
    "bundled.artifactArchiveSha256"
  );
  const evidenceSha256 = bounded(source.evidenceSha256, SHA256, "bundled.evidenceSha256");
  const evidence = parseFlowcordiaBundledCleanInstallEvidence(source.evidence);
  exact(evidence.source.runId, runId, "bundled.source.runId");
  exact(evidence.source.runAttempt, runAttempt, "bundled.source.runAttempt");
  exact(evidence.source.workflowPath, source.workflowPath, "bundled.source.workflowPath");
  exact(evidence.source.sourceCommitSha, workflowCommitSha, "bundled.source.sourceCommitSha");
  exact(evidence.releaseId, input.releaseId, "bundled.releaseId");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "bundled.applicationCommitSha");
  exact(evidence.applicationImageDigest, input.targetImageDigest, "bundled.applicationImageDigest");
  return {
    summary: {
      publicationRunId: evidence.publicationRunId,
      compatibilityVersion: evidence.compatibilityVersion,
      applicationManifestSha256: evidence.applicationManifestSha256,
      applicationImageDigest: evidence.applicationImageDigest,
      bundledManifestSha256: evidence.bundledManifestSha256,
      cleanInstallEvidenceSha256: evidenceSha256,
    },
    identity: {
      stage: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE,
      runId,
      runAttempt,
      workflowPath: source.workflowPath,
      workflowCommitSha,
      artifactName,
      artifactArchiveSha256,
      evidenceSha256,
      startedAt: evidence.startedAt,
      completedAt: evidence.completedAt,
    },
    evidence,
  };
}

export function assembleFlowcordiaBundledLaunchManifest(input: {
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
  proposalId: string;
  assembledAt: string;
  sources: readonly FlowcordiaBundledLaunchEvidenceSource[];
}): FlowcordiaBundledLaunchManifest {
  if (input.sources.length !== 10) {
    throw new FlowcordiaBundledLaunchEvidenceError(
      "missing_stage",
      "Bundled launch evidence requires exactly ten source artifacts."
    );
  }
  const bundledSources = input.sources.filter(
    (source): source is FlowcordiaBundledCleanInstallEvidenceSource =>
      source.stage === FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE
  );
  if (bundledSources.length !== 1) {
    throw new FlowcordiaBundledLaunchEvidenceError(
      "missing_stage",
      "Bundled launch evidence requires exactly one clean-install artifact."
    );
  }
  const selfHostSources = input.sources.filter(
    (source): source is FlowcordiaSelfHostLaunchEvidenceSource =>
      source.stage !== FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE
  );
  const base = assembleFlowcordiaSelfHostLaunchManifest({
    releaseId: input.releaseId,
    applicationCommitSha: input.applicationCommitSha,
    workflowId: input.workflowId,
    proposalId: input.proposalId,
    assembledAt: input.assembledAt,
    sources: selfHostSources,
  });
  const bundled = validateBundledSource({
    source: bundledSources[0]!,
    releaseId: input.releaseId,
    applicationCommitSha: input.applicationCommitSha,
    targetImageDigest: base.selfHost.targetImageDigest,
  });
  if (new Set(input.sources.map((source) => source.runId)).size !== input.sources.length) {
    throw new FlowcordiaBundledLaunchEvidenceError(
      "evidence_mismatch",
      "Every bundled launch stage must come from a distinct workflow run."
    );
  }
  const lifecycle = base.sourceRuns.find((source) => source.stage === "self_host_lifecycle");
  if (!lifecycle) {
    throw new FlowcordiaBundledLaunchEvidenceError(
      "missing_stage",
      "Bundled launch evidence is missing self-host lifecycle acceptance."
    );
  }
  if (Date.parse(bundled.identity.completedAt) > Date.parse(lifecycle.startedAt)) {
    throw new FlowcordiaBundledLaunchEvidenceError(
      "evidence_mismatch",
      "Self-host lifecycle acceptance started before bundled clean installation completed."
    );
  }
  if (Date.parse(bundled.identity.completedAt) > Date.parse(input.assembledAt)) {
    throw new FlowcordiaBundledLaunchEvidenceError(
      "invalid_input",
      "Bundled launch manifest assembly precedes clean-install completion."
    );
  }
  const sourceRuns: FlowcordiaBundledLaunchSourceIdentity[] = [
    bundled.identity,
    ...base.sourceRuns,
  ];
  const { manifestSha256: _baseDigest, schemaVersion: _baseSchema, ...baseWithoutDigest } = base;
  const withoutDigest = {
    ...baseWithoutDigest,
    schemaVersion: "0.6" as const,
    bundledSelfHost: bundled.summary,
    sourceRuns,
  };
  return {
    ...withoutDigest,
    manifestSha256: flowcordiaReleaseEvidenceSha256(withoutDigest),
  };
}
