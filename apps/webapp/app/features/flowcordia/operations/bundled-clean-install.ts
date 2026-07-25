export const FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW =
  ".github/workflows/flowcordia-bundled-clean-install.yml" as const;
export const FLOWCORDIA_BUNDLED_CLEAN_INSTALL_SCHEMA_VERSION = "0.1" as const;

export interface FlowcordiaBundledCleanInstallEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-bundled-clean-install";
  result: "READY";
  phase: "complete";
  cleanup: "READY";
  source: {
    runId: string;
    runAttempt: number;
    workflowPath: typeof FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW;
    sourceCommitSha: string;
  };
  publicationRunId: string;
  releaseId: string;
  applicationCommitSha: string;
  applicationManifestSha256: string;
  applicationImageDigest: string;
  bundledManifestSha256: string;
  compatibilityVersion: number;
  startedAt: string;
  completedAt: string;
}

export class FlowcordiaBundledCleanInstallEvidenceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaBundledCleanInstallEvidenceError";
  }
}

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaBundledCleanInstallEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new FlowcordiaBundledCleanInstallEvidenceError(
      "invalid_evidence",
      `${label} has unexpected fields.`
    );
  }
}

function bounded(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new FlowcordiaBundledCleanInstallEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new FlowcordiaBundledCleanInstallEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return Number(value);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new FlowcordiaBundledCleanInstallEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaBundledCleanInstallEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return value;
}

export function parseFlowcordiaBundledCleanInstallEvidence(
  value: unknown
): FlowcordiaBundledCleanInstallEvidence {
  const evidence = record(value, "Bundled clean-install evidence");
  exactKeys(
    evidence,
    [
      "applicationCommitSha",
      "applicationImageDigest",
      "applicationManifestSha256",
      "bundledManifestSha256",
      "cleanup",
      "compatibilityVersion",
      "completedAt",
      "kind",
      "phase",
      "publicationRunId",
      "releaseId",
      "result",
      "schemaVersion",
      "source",
      "startedAt",
    ],
    "Bundled clean-install evidence"
  );
  if (
    evidence.schemaVersion !== FLOWCORDIA_BUNDLED_CLEAN_INSTALL_SCHEMA_VERSION ||
    evidence.kind !== "flowcordia-bundled-clean-install" ||
    evidence.result !== "READY" ||
    evidence.phase !== "complete" ||
    evidence.cleanup !== "READY"
  ) {
    throw new FlowcordiaBundledCleanInstallEvidenceError(
      "not_ready",
      "Bundled clean-install evidence is not READY and complete."
    );
  }
  const source = record(evidence.source, "Bundled clean-install source");
  exactKeys(source, ["runAttempt", "runId", "sourceCommitSha", "workflowPath"], "Bundled clean-install source");
  if (source.workflowPath !== FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW) {
    throw new FlowcordiaBundledCleanInstallEvidenceError(
      "invalid_evidence",
      "Bundled clean-install workflow path is invalid."
    );
  }
  const startedAt = timestamp(evidence.startedAt, "startedAt");
  const completedAt = timestamp(evidence.completedAt, "completedAt");
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    throw new FlowcordiaBundledCleanInstallEvidenceError(
      "invalid_evidence",
      "Bundled clean-install chronology is invalid."
    );
  }
  return {
    schemaVersion: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_SCHEMA_VERSION,
    kind: "flowcordia-bundled-clean-install",
    result: "READY",
    phase: "complete",
    cleanup: "READY",
    source: {
      runId: bounded(source.runId, RUN_ID, "source.runId"),
      runAttempt: positiveInteger(source.runAttempt, "source.runAttempt", 100),
      workflowPath: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW,
      sourceCommitSha: bounded(source.sourceCommitSha, SHA, "source.sourceCommitSha"),
    },
    publicationRunId: bounded(evidence.publicationRunId, RUN_ID, "publicationRunId"),
    releaseId: bounded(evidence.releaseId, RELEASE_ID, "releaseId"),
    applicationCommitSha: bounded(evidence.applicationCommitSha, SHA, "applicationCommitSha"),
    applicationManifestSha256: bounded(
      evidence.applicationManifestSha256,
      SHA256,
      "applicationManifestSha256"
    ),
    applicationImageDigest: bounded(evidence.applicationImageDigest, SHA256, "applicationImageDigest"),
    bundledManifestSha256: bounded(evidence.bundledManifestSha256, SHA256, "bundledManifestSha256"),
    compatibilityVersion: positiveInteger(
      evidence.compatibilityVersion,
      "compatibilityVersion",
      9_999
    ),
    startedAt,
    completedAt,
  };
}
