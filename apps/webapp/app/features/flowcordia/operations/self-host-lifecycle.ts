import {
  flowcordiaRecoverySha256,
  parseFlowcordiaBackupManifest,
  type FlowcordiaBackupManifest,
  type FlowcordiaRestoreRehearsalEvidence,
} from "./database-recovery";
import {
  parseFlowcordiaMigrationCompletionEvidence,
  type FlowcordiaMigrationCompletionEvidence,
} from "./migration-evidence";
import {
  parseFlowcordiaReleaseDistributionManifest,
  type FlowcordiaReleaseDistributionManifest,
} from "./release-distribution";
import {
  parseFlowcordiaReleaseImageEvidence,
  type FlowcordiaReleaseImageEvidence,
} from "./release-image-evidence";
import {
  parseFlowcordiaSelfHostCleanDependenciesEvidence,
  parseFlowcordiaSelfHostInstallationIdentityEvidence,
  type FlowcordiaSelfHostCleanDependenciesEvidence,
  type FlowcordiaSelfHostInstallationIdentityEvidence,
} from "./self-host-lifecycle-preflight";

export const FLOWCORDIA_SELF_HOST_LIFECYCLE_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_SELF_HOST_LIFECYCLE_WORKFLOW =
  ".github/workflows/flowcordia-self-host-lifecycle.yml" as const;

export const FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES = [
  "artifact_verification",
  "installation_identity",
  "clean_dependency_state",
  "clean_install",
  "current_migration",
  "current_start",
  "current_diagnostics",
  "idempotent_restart",
  "restart_diagnostics",
  "recovery_rehearsal",
  "upgrade_preflight",
  "target_migration",
  "target_start",
  "target_diagnostics",
  "rollback_boundary",
  "teardown",
] as const;

export type FlowcordiaSelfHostLifecyclePhaseKey =
  (typeof FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES)[number];
export type FlowcordiaSelfHostRollbackMode = "application_rollback" | "restore_required";

interface FlowcordiaDoctorEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-self-host-diagnostics";
  state: "READY";
  profile: "release";
  release: {
    releaseId: string;
    version: string;
    applicationCommitSha: string;
    upstreamCommitSha: string;
    imageDigest: string;
    manifestSha256: string;
  };
  checkedAt: string;
  checks: Array<{ key: string; state: "READY" | "SKIPPED"; message: string }>;
  evidenceSha256: string;
}

interface FlowcordiaUpgradeCommandEvidence {
  schemaVersion: "0.1";
  state: "READY";
  phase: "upgrade";
  checkedAt: string;
  configuration: {
    schemaVersion: "0.1";
    profile: "release";
    state: "READY";
    checkedAt: string;
  };
  upgrade: {
    schemaVersion: "0.1";
    state: "READY";
    kind: "application_only" | "append_only_migrations";
    checkedAt: string;
    currentApplicationCommitSha: string;
    targetApplicationCommitSha: string;
    migrations: {
      currentCount: number;
      targetCount: number;
      pendingCount: number;
      currentDigest: string;
      targetDigest: string;
    };
    recovery: {
      required: boolean;
      backupManifestSha256?: string;
      restoreEvidenceSha256?: string;
    };
    steps: string[];
    checks: Array<{ key: string; state: "READY"; message: string }>;
  };
}

export interface FlowcordiaSelfHostLifecycleObservations {
  schemaVersion: "0.1";
  kind: "flowcordia-self-host-lifecycle-observations";
  workspaceId: string;
  startedAt: string;
  completedAt: string;
  phases: Array<{
    key: FlowcordiaSelfHostLifecyclePhaseKey;
    state: "READY";
    observedAt: string;
  }>;
  teardown: {
    applicationContainersAbsent: true;
    applicationNetworkAbsent: true;
    applicationVolumesAbsent: true;
  };
}

export interface FlowcordiaSelfHostLifecycleEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-self-host-lifecycle";
  state: "READY";
  checkedAt: string;
  current: {
    releaseId: string;
    version: string;
    applicationCommitSha: string;
    imageDigest: string;
    manifestSha256: string;
    publicationEvidenceSha256: string;
    migrationEvidenceSha256: string;
    installDiagnosticsSha256: string;
    restartDiagnosticsSha256: string;
  };
  target: {
    releaseId: string;
    version: string;
    applicationCommitSha: string;
    imageDigest: string;
    manifestSha256: string;
    publicationEvidenceSha256: string;
    migrationEvidenceSha256: string;
    diagnosticsSha256: string;
  };
  installation: {
    identityEvidenceSha256: string;
    installationSha256: string;
    cleanDependenciesEvidenceSha256: string;
  };
  recovery: {
    backupManifestSha256: string;
    restoreEvidenceSha256: string;
    archiveSha256: string;
    postgresMajor: number;
  };
  upgrade: {
    kind: "application_only" | "append_only_migrations";
    evidenceSha256: string;
    currentMigrationCount: number;
    targetMigrationCount: number;
    pendingMigrationCount: number;
  };
  rollback: {
    mode: FlowcordiaSelfHostRollbackMode;
    restoredReleaseId?: string;
    diagnosticsSha256?: string;
    recoveryRequired: boolean;
  };
  phases: FlowcordiaSelfHostLifecycleObservations["phases"];
  source: {
    repository: string;
    workflowPath: typeof FLOWCORDIA_SELF_HOST_LIFECYCLE_WORKFLOW;
    runId: string;
    runAttempt: number;
    sourceRef: "refs/heads/main";
    sourceCommitSha: string;
    runner: "self-hosted";
  };
  evidenceSha256: string;
}

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DECIMAL_ID = /^[1-9][0-9]{0,19}$/;
const WORKSPACE_ID = /^[0-9a-f]{12}$/;
const REPOSITORY = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9][a-z0-9._-]{0,99}$/;
const RESTORE_KEYS = [
  "archive_integrity",
  "tool_compatibility",
  "restore_completed",
  "migration_parity",
  "cleanup_completed",
] as const;

export class FlowcordiaSelfHostLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaSelfHostLifecycleError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaSelfHostLifecycleError("invalid_object", `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new FlowcordiaSelfHostLifecycleError(
      "unexpected_fields",
      `${label} has unexpected fields.`
    );
  }
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new FlowcordiaSelfHostLifecycleError("invalid_time", `${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaSelfHostLifecycleError("invalid_time", `${label} is invalid.`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new FlowcordiaSelfHostLifecycleError("invalid_digest", `${label} is invalid.`);
  }
  return value;
}

function applicationSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA.test(value) || /^([0-9a-f])\1{39}$/.test(value)) {
    throw new FlowcordiaSelfHostLifecycleError("invalid_application", `${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new FlowcordiaSelfHostLifecycleError("invalid_number", `${label} is invalid.`);
  }
  return Number(value);
}

function withoutDigest(
  evidence:
    | Omit<FlowcordiaSelfHostLifecycleEvidence, "evidenceSha256">
    | FlowcordiaSelfHostLifecycleEvidence
): Omit<FlowcordiaSelfHostLifecycleEvidence, "evidenceSha256"> {
  return {
    schemaVersion: evidence.schemaVersion,
    kind: evidence.kind,
    state: evidence.state,
    checkedAt: evidence.checkedAt,
    current: evidence.current,
    target: evidence.target,
    installation: evidence.installation,
    recovery: evidence.recovery,
    upgrade: evidence.upgrade,
    rollback: evidence.rollback,
    phases: evidence.phases,
    source: evidence.source,
  };
}

export function flowcordiaSelfHostLifecycleSha256(
  evidence: Omit<FlowcordiaSelfHostLifecycleEvidence, "evidenceSha256">
): string {
  return flowcordiaRecoverySha256(evidence);
}

function parseDoctor(
  value: unknown,
  manifest: FlowcordiaReleaseDistributionManifest,
  label: string
): FlowcordiaDoctorEvidence {
  const evidence = record(value, label);
  exactKeys(
    evidence,
    [
      "checkedAt",
      "checks",
      "evidenceSha256",
      "kind",
      "profile",
      "release",
      "schemaVersion",
      "state",
    ],
    label
  );
  const release = record(evidence.release, `${label}.release`);
  exactKeys(
    release,
    [
      "applicationCommitSha",
      "imageDigest",
      "manifestSha256",
      "releaseId",
      "upstreamCommitSha",
      "version",
    ],
    `${label}.release`
  );
  if (
    evidence.schemaVersion !== "0.1" ||
    evidence.kind !== "flowcordia-self-host-diagnostics" ||
    evidence.state !== "READY" ||
    evidence.profile !== "release" ||
    release.releaseId !== manifest.releaseId ||
    release.version !== manifest.version ||
    release.applicationCommitSha !== manifest.applicationCommitSha ||
    release.upstreamCommitSha !== manifest.upstreamCommitSha ||
    release.imageDigest !== manifest.image.digest ||
    release.manifestSha256 !== manifest.manifestSha256 ||
    !Array.isArray(evidence.checks) ||
    evidence.checks.length < 10
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_diagnostics",
      `${label} does not prove one exact READY release.`
    );
  }
  const checks = evidence.checks.map((candidate, index) => {
    const check = record(candidate, `${label}.checks.${index}`);
    exactKeys(check, ["key", "message", "state"], `${label}.checks.${index}`);
    if (
      typeof check.key !== "string" ||
      typeof check.message !== "string" ||
      check.message.length < 3 ||
      check.message.length > 240 ||
      (check.state !== "READY" && check.state !== "SKIPPED")
    ) {
      throw new FlowcordiaSelfHostLifecycleError(
        "invalid_diagnostics",
        `${label} contains an invalid check.`
      );
    }
    return {
      key: check.key,
      state: check.state,
      message: check.message,
    } as FlowcordiaDoctorEvidence["checks"][number];
  });
  if (checks.filter((entry) => entry.state === "READY").length < 10) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_diagnostics",
      `${label} does not contain the required READY checks.`
    );
  }
  const parsed: FlowcordiaDoctorEvidence = {
    schemaVersion: "0.1",
    kind: "flowcordia-self-host-diagnostics",
    state: "READY",
    profile: "release",
    release: {
      releaseId: manifest.releaseId,
      version: manifest.version,
      applicationCommitSha: manifest.applicationCommitSha,
      upstreamCommitSha: manifest.upstreamCommitSha,
      imageDigest: manifest.image.digest,
      manifestSha256: manifest.manifestSha256,
    },
    checkedAt: timestamp(evidence.checkedAt, `${label}.checkedAt`),
    checks,
    evidenceSha256: digest(evidence.evidenceSha256, `${label}.evidenceSha256`),
  };
  const doctorWithoutDigest = {
    schemaVersion: parsed.schemaVersion,
    kind: parsed.kind,
    state: parsed.state,
    profile: parsed.profile,
    release: parsed.release,
    checkedAt: parsed.checkedAt,
    checks: parsed.checks,
  };
  if (flowcordiaRecoverySha256(doctorWithoutDigest) !== parsed.evidenceSha256) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_diagnostics_digest",
      `${label} digest is invalid.`
    );
  }
  return parsed;
}

function parseRestore(
  value: unknown,
  backup: FlowcordiaBackupManifest
): FlowcordiaRestoreRehearsalEvidence {
  const evidence = record(value, "Restore rehearsal evidence");
  exactKeys(
    evidence,
    [
      "applicationCommitSha",
      "archiveSha256",
      "backupManifestSha256",
      "checkedAt",
      "checks",
      "evidenceSha256",
      "kind",
      "migrations",
      "postgresMajor",
      "releaseId",
      "result",
      "schemaVersion",
    ],
    "Restore rehearsal evidence"
  );
  const migrations = record(evidence.migrations, "Restore migration inventory");
  exactKeys(migrations, ["count", "sha256"], "Restore migration inventory");
  if (
    evidence.schemaVersion !== "0.1" ||
    evidence.kind !== "flowcordia-postgresql-restore-rehearsal" ||
    evidence.result !== "READY" ||
    evidence.releaseId !== backup.releaseId ||
    evidence.applicationCommitSha !== backup.applicationCommitSha ||
    evidence.backupManifestSha256 !== backup.manifestSha256 ||
    evidence.archiveSha256 !== backup.archive.sha256 ||
    evidence.postgresMajor !== backup.postgresMajor ||
    migrations.count !== backup.migrations.count ||
    migrations.sha256 !== backup.migrations.sha256 ||
    !Array.isArray(evidence.checks) ||
    evidence.checks.length !== RESTORE_KEYS.length
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_restore",
      "Restore rehearsal evidence does not match the current release backup."
    );
  }
  const checks = evidence.checks.map((candidate, index) => {
    const check = record(candidate, `Restore check ${index}`);
    exactKeys(check, ["key", "state"], `Restore check ${index}`);
    if (check.key !== RESTORE_KEYS[index] || check.state !== "READY") {
      throw new FlowcordiaSelfHostLifecycleError(
        "invalid_restore",
        "Restore rehearsal checks are incomplete or unordered."
      );
    }
    return { key: RESTORE_KEYS[index]!, state: "READY" as const };
  });
  const parsed: FlowcordiaRestoreRehearsalEvidence = {
    schemaVersion: "0.1",
    kind: "flowcordia-postgresql-restore-rehearsal",
    releaseId: backup.releaseId,
    applicationCommitSha: backup.applicationCommitSha,
    result: "READY",
    checkedAt: timestamp(evidence.checkedAt, "Restore check time"),
    postgresMajor: backup.postgresMajor,
    backupManifestSha256: backup.manifestSha256,
    archiveSha256: backup.archive.sha256,
    migrations: backup.migrations,
    checks,
    evidenceSha256: digest(evidence.evidenceSha256, "Restore evidence digest"),
  };
  const restoreWithoutDigest = {
    schemaVersion: parsed.schemaVersion,
    kind: parsed.kind,
    releaseId: parsed.releaseId,
    applicationCommitSha: parsed.applicationCommitSha,
    result: parsed.result,
    checkedAt: parsed.checkedAt,
    postgresMajor: parsed.postgresMajor,
    backupManifestSha256: parsed.backupManifestSha256,
    archiveSha256: parsed.archiveSha256,
    migrations: parsed.migrations,
    checks: parsed.checks,
  };
  if (flowcordiaRecoverySha256(restoreWithoutDigest) !== parsed.evidenceSha256) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_restore_digest",
      "Restore rehearsal evidence digest is invalid."
    );
  }
  return parsed;
}

function parseUpgrade(
  value: unknown,
  current: FlowcordiaReleaseDistributionManifest,
  target: FlowcordiaReleaseDistributionManifest,
  backup: FlowcordiaBackupManifest,
  restore: FlowcordiaRestoreRehearsalEvidence
): FlowcordiaUpgradeCommandEvidence {
  const outer = record(value, "Upgrade evidence");
  const requiredOuter = [
    "checkedAt",
    "configuration",
    "message",
    "phase",
    "schemaVersion",
    "state",
    "upgrade",
  ];
  exactKeys(outer, requiredOuter, "Upgrade evidence");
  const configuration = record(outer.configuration, "Upgrade configuration");
  const upgrade = record(outer.upgrade, "Upgrade projection");
  const migrations = record(upgrade.migrations, "Upgrade migrations");
  const recovery = record(upgrade.recovery, "Upgrade recovery");
  if (
    outer.schemaVersion !== "0.1" ||
    outer.state !== "READY" ||
    outer.phase !== "upgrade" ||
    configuration.schemaVersion !== "0.1" ||
    configuration.profile !== "release" ||
    configuration.state !== "READY" ||
    upgrade.schemaVersion !== "0.1" ||
    upgrade.state !== "READY" ||
    (upgrade.kind !== "application_only" && upgrade.kind !== "append_only_migrations") ||
    upgrade.currentApplicationCommitSha !== current.applicationCommitSha ||
    upgrade.targetApplicationCommitSha !== target.applicationCommitSha ||
    migrations.currentCount !== current.migrations.count ||
    migrations.targetCount !== target.migrations.count ||
    migrations.currentDigest !== current.migrations.sha256 ||
    migrations.targetDigest !== target.migrations.sha256 ||
    migrations.pendingCount !== target.migrations.count - current.migrations.count ||
    !Array.isArray(upgrade.steps) ||
    !upgrade.steps.includes("connected_acceptance") ||
    !Array.isArray(upgrade.checks) ||
    upgrade.checks.length < 7 ||
    upgrade.checks.some((entry) => record(entry, "Upgrade check").state !== "READY")
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_upgrade",
      "Upgrade evidence does not match the current and target releases."
    );
  }
  const migrationUpgrade = upgrade.kind === "append_only_migrations";
  if (
    (migrationUpgrade &&
      (recovery.required !== true ||
        recovery.backupManifestSha256 !== backup.manifestSha256 ||
        recovery.restoreEvidenceSha256 !== restore.evidenceSha256 ||
        Number(migrations.pendingCount) < 1)) ||
    (!migrationUpgrade && (recovery.required !== false || migrations.pendingCount !== 0))
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_upgrade_recovery",
      "Upgrade recovery boundary is inconsistent with the migration delta."
    );
  }
  const checkedAt = timestamp(outer.checkedAt, "Upgrade check time");
  if (configuration.checkedAt !== checkedAt || upgrade.checkedAt !== checkedAt) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_upgrade_time",
      "Upgrade evidence timestamps do not agree."
    );
  }
  return outer as unknown as FlowcordiaUpgradeCommandEvidence;
}

function parseObservations(value: unknown): FlowcordiaSelfHostLifecycleObservations {
  const observations = record(value, "Lifecycle observations");
  exactKeys(
    observations,
    ["completedAt", "kind", "phases", "schemaVersion", "startedAt", "teardown", "workspaceId"],
    "Lifecycle observations"
  );
  const teardown = record(observations.teardown, "Lifecycle teardown");
  exactKeys(
    teardown,
    ["applicationContainersAbsent", "applicationNetworkAbsent", "applicationVolumesAbsent"],
    "Lifecycle teardown"
  );
  if (
    observations.schemaVersion !== "0.1" ||
    observations.kind !== "flowcordia-self-host-lifecycle-observations" ||
    typeof observations.workspaceId !== "string" ||
    !WORKSPACE_ID.test(observations.workspaceId) ||
    !Array.isArray(observations.phases) ||
    observations.phases.length !== FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES.length ||
    teardown.applicationContainersAbsent !== true ||
    teardown.applicationNetworkAbsent !== true ||
    teardown.applicationVolumesAbsent !== true
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_observations",
      "Lifecycle observations are invalid or incomplete."
    );
  }
  const startedAt = timestamp(observations.startedAt, "Lifecycle start time");
  const completedAt = timestamp(observations.completedAt, "Lifecycle completion time");
  let previous = Date.parse(startedAt);
  const phases = observations.phases.map((candidate, index) => {
    const phase = record(candidate, `Lifecycle phase ${index}`);
    exactKeys(phase, ["key", "observedAt", "state"], `Lifecycle phase ${index}`);
    const observedAt = timestamp(phase.observedAt, `Lifecycle phase ${index} time`);
    if (
      phase.key !== FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES[index] ||
      phase.state !== "READY" ||
      Date.parse(observedAt) < previous
    ) {
      throw new FlowcordiaSelfHostLifecycleError(
        "invalid_phase",
        "Lifecycle phases are incomplete, unordered, or unsuccessful."
      );
    }
    previous = Date.parse(observedAt);
    return {
      key: FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES[index]!,
      state: "READY" as const,
      observedAt,
    };
  });
  if (Date.parse(completedAt) < previous) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_phase_time",
      "Lifecycle completion precedes a required phase."
    );
  }
  return {
    schemaVersion: "0.1",
    kind: "flowcordia-self-host-lifecycle-observations",
    workspaceId: observations.workspaceId,
    startedAt,
    completedAt,
    phases,
    teardown: {
      applicationContainersAbsent: true,
      applicationNetworkAbsent: true,
      applicationVolumesAbsent: true,
    },
  };
}

function requireChronology(input: {
  observations: FlowcordiaSelfHostLifecycleObservations;
  currentManifest: FlowcordiaReleaseDistributionManifest;
  targetManifest: FlowcordiaReleaseDistributionManifest;
  currentImageEvidence: FlowcordiaReleaseImageEvidence;
  targetImageEvidence: FlowcordiaReleaseImageEvidence;
  installationIdentity: FlowcordiaSelfHostInstallationIdentityEvidence;
  cleanDependencies: FlowcordiaSelfHostCleanDependenciesEvidence;
  currentMigration: FlowcordiaMigrationCompletionEvidence;
  installDoctor: FlowcordiaDoctorEvidence;
  restartDoctor: FlowcordiaDoctorEvidence;
  backup: FlowcordiaBackupManifest;
  restore: FlowcordiaRestoreRehearsalEvidence;
  upgrade: FlowcordiaUpgradeCommandEvidence;
  targetMigration: FlowcordiaMigrationCompletionEvidence;
  targetDoctor: FlowcordiaDoctorEvidence;
  rollbackDoctor?: FlowcordiaDoctorEvidence;
}): void {
  const ordered = [
    input.currentManifest.createdAt,
    input.currentImageEvidence.createdAt,
    input.targetManifest.createdAt,
    input.targetImageEvidence.createdAt,
    input.observations.startedAt,
    input.installationIdentity.checkedAt,
    input.cleanDependencies.checkedAt,
    input.currentMigration.completedAt,
    input.installDoctor.checkedAt,
    input.restartDoctor.checkedAt,
    input.backup.createdAt,
    input.restore.checkedAt,
    input.upgrade.checkedAt,
    input.targetMigration.completedAt,
    input.targetDoctor.checkedAt,
    ...(input.rollbackDoctor ? [input.rollbackDoctor.checkedAt] : []),
    input.observations.completedAt,
  ].map((value) => Date.parse(value));
  if (
    ordered.some((value) => !Number.isFinite(value)) ||
    ordered.slice(1).some((value, index) => value < ordered[index]!)
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_chronology",
      "Lifecycle evidence chronology is invalid."
    );
  }
  const phaseTime = Object.fromEntries(
    input.observations.phases.map((phase) => [phase.key, Date.parse(phase.observedAt)])
  ) as Record<FlowcordiaSelfHostLifecyclePhaseKey, number>;
  const boundaries: Array<[string, string, number]> = [
    [
      "installation identity",
      input.installationIdentity.checkedAt,
      phaseTime.installation_identity,
    ],
    ["clean dependency state", input.cleanDependencies.checkedAt, phaseTime.clean_dependency_state],
    ["current migration", input.currentMigration.completedAt, phaseTime.current_migration],
    ["current diagnostics", input.installDoctor.checkedAt, phaseTime.current_diagnostics],
    ["restart diagnostics", input.restartDoctor.checkedAt, phaseTime.restart_diagnostics],
    ["recovery rehearsal", input.restore.checkedAt, phaseTime.recovery_rehearsal],
    ["upgrade preflight", input.upgrade.checkedAt, phaseTime.upgrade_preflight],
    ["target migration", input.targetMigration.completedAt, phaseTime.target_migration],
    ["target diagnostics", input.targetDoctor.checkedAt, phaseTime.target_diagnostics],
    ...(input.rollbackDoctor
      ? [
          ["rollback diagnostics", input.rollbackDoctor.checkedAt, phaseTime.rollback_boundary] as [
            string,
            string,
            number,
          ],
        ]
      : []),
  ];
  if (boundaries.some(([, observedAt, boundary]) => Date.parse(observedAt) > boundary)) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_phase_evidence",
      "Lifecycle phase evidence occurs after its recorded completion boundary."
    );
  }
}

export function createFlowcordiaSelfHostLifecycleEvidence(input: {
  currentManifest: unknown;
  currentImageEvidence: unknown;
  installationIdentityEvidence: unknown;
  cleanDependenciesEvidence: unknown;
  currentMigrationEvidence: unknown;
  currentInstallDiagnostics: unknown;
  currentRestartDiagnostics: unknown;
  backupManifest: unknown;
  restoreEvidence: unknown;
  upgradeEvidence: unknown;
  targetManifest: unknown;
  targetImageEvidence: unknown;
  targetMigrationEvidence: unknown;
  targetDiagnostics: unknown;
  rollbackDiagnostics?: unknown;
  observations: unknown;
  checkedAt: Date;
  source: {
    repository: string;
    runId: string;
    runAttempt: number;
    sourceCommitSha: string;
  };
}): FlowcordiaSelfHostLifecycleEvidence {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_time",
      "Lifecycle evidence assembly time is invalid."
    );
  }
  const currentManifest = parseFlowcordiaReleaseDistributionManifest(input.currentManifest);
  const targetManifest = parseFlowcordiaReleaseDistributionManifest(input.targetManifest);
  if (
    currentManifest.releaseId === targetManifest.releaseId ||
    currentManifest.applicationCommitSha === targetManifest.applicationCommitSha ||
    currentManifest.image.digest === targetManifest.image.digest
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "mixed_release",
      "Current and target lifecycle releases must be exact and distinct."
    );
  }
  const currentImageEvidence = parseFlowcordiaReleaseImageEvidence(
    input.currentImageEvidence,
    currentManifest
  );
  const targetImageEvidence = parseFlowcordiaReleaseImageEvidence(
    input.targetImageEvidence,
    targetManifest
  );
  if (currentImageEvidence.workflow.runId === targetImageEvidence.workflow.runId) {
    throw new FlowcordiaSelfHostLifecycleError(
      "reused_publication",
      "Current and target releases require distinct protected publication runs."
    );
  }
  const installationIdentity = parseFlowcordiaSelfHostInstallationIdentityEvidence(
    input.installationIdentityEvidence,
    currentManifest,
    targetManifest
  );
  const cleanDependencies = parseFlowcordiaSelfHostCleanDependenciesEvidence(
    input.cleanDependenciesEvidence,
    currentManifest
  );
  const currentMigration = parseFlowcordiaMigrationCompletionEvidence(
    input.currentMigrationEvidence,
    currentManifest
  );
  const targetMigration = parseFlowcordiaMigrationCompletionEvidence(
    input.targetMigrationEvidence,
    targetManifest
  );
  const installDoctor = parseDoctor(
    input.currentInstallDiagnostics,
    currentManifest,
    "Current install diagnostics"
  );
  const restartDoctor = parseDoctor(
    input.currentRestartDiagnostics,
    currentManifest,
    "Current restart diagnostics"
  );
  const targetDoctor = parseDoctor(input.targetDiagnostics, targetManifest, "Target diagnostics");
  if (installDoctor.evidenceSha256 === restartDoctor.evidenceSha256) {
    throw new FlowcordiaSelfHostLifecycleError(
      "reused_diagnostics",
      "Install and restart diagnostics must be distinct point-in-time artifacts."
    );
  }
  const backup = parseFlowcordiaBackupManifest(input.backupManifest);
  if (
    backup.releaseId !== currentManifest.releaseId ||
    backup.applicationCommitSha !== currentManifest.applicationCommitSha ||
    backup.migrations.count !== currentManifest.migrations.count
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "backup_mismatch",
      "Backup manifest does not match the current release."
    );
  }
  const restore = parseRestore(input.restoreEvidence, backup);
  const upgrade = parseUpgrade(
    input.upgradeEvidence,
    currentManifest,
    targetManifest,
    backup,
    restore
  );
  const observations = parseObservations(input.observations);
  const rollbackMode: FlowcordiaSelfHostRollbackMode =
    upgrade.upgrade.kind === "application_only" ? "application_rollback" : "restore_required";
  let rollbackDoctor: FlowcordiaDoctorEvidence | undefined;
  if (rollbackMode === "application_rollback") {
    if (input.rollbackDiagnostics === undefined) {
      throw new FlowcordiaSelfHostLifecycleError(
        "missing_rollback",
        "Application-only lifecycle acceptance requires an observed rollback diagnostic."
      );
    }
    rollbackDoctor = parseDoctor(
      input.rollbackDiagnostics,
      currentManifest,
      "Rollback diagnostics"
    );
    if (
      [installDoctor.evidenceSha256, restartDoctor.evidenceSha256].includes(
        rollbackDoctor.evidenceSha256
      )
    ) {
      throw new FlowcordiaSelfHostLifecycleError(
        "reused_rollback",
        "Rollback diagnostics must be a new point-in-time artifact."
      );
    }
  } else if (input.rollbackDiagnostics !== undefined) {
    throw new FlowcordiaSelfHostLifecycleError(
      "unsafe_rollback",
      "Migration-bearing lifecycle acceptance must not start the previous application on the forward schema."
    );
  }
  requireChronology({
    observations,
    currentManifest,
    targetManifest,
    currentImageEvidence,
    targetImageEvidence,
    installationIdentity,
    cleanDependencies,
    currentMigration,
    installDoctor,
    restartDoctor,
    backup,
    restore,
    upgrade,
    targetMigration,
    targetDoctor,
    rollbackDoctor,
  });
  if (
    !REPOSITORY.test(input.source.repository) ||
    input.source.repository !== input.source.repository.toLowerCase() ||
    !DECIMAL_ID.test(input.source.runId) ||
    !Number.isSafeInteger(input.source.runAttempt) ||
    input.source.runAttempt < 1 ||
    input.source.runAttempt > 1000 ||
    applicationSha(input.source.sourceCommitSha, "Lifecycle source revision") !==
      targetManifest.applicationCommitSha
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_source",
      "Lifecycle source workflow identity is invalid."
    );
  }
  const evidenceWithoutDigest: Omit<FlowcordiaSelfHostLifecycleEvidence, "evidenceSha256"> = {
    schemaVersion: FLOWCORDIA_SELF_HOST_LIFECYCLE_SCHEMA_VERSION,
    kind: "flowcordia-self-host-lifecycle",
    state: "READY",
    checkedAt: input.checkedAt.toISOString(),
    current: {
      releaseId: currentManifest.releaseId,
      version: currentManifest.version,
      applicationCommitSha: currentManifest.applicationCommitSha,
      imageDigest: currentManifest.image.digest,
      manifestSha256: currentManifest.manifestSha256,
      publicationEvidenceSha256: currentImageEvidence.evidenceSha256,
      migrationEvidenceSha256: currentMigration.evidenceSha256,
      installDiagnosticsSha256: installDoctor.evidenceSha256,
      restartDiagnosticsSha256: restartDoctor.evidenceSha256,
    },
    target: {
      releaseId: targetManifest.releaseId,
      version: targetManifest.version,
      applicationCommitSha: targetManifest.applicationCommitSha,
      imageDigest: targetManifest.image.digest,
      manifestSha256: targetManifest.manifestSha256,
      publicationEvidenceSha256: targetImageEvidence.evidenceSha256,
      migrationEvidenceSha256: targetMigration.evidenceSha256,
      diagnosticsSha256: targetDoctor.evidenceSha256,
    },
    installation: {
      identityEvidenceSha256: installationIdentity.evidenceSha256,
      installationSha256: installationIdentity.installationSha256,
      cleanDependenciesEvidenceSha256: cleanDependencies.evidenceSha256,
    },
    recovery: {
      backupManifestSha256: backup.manifestSha256,
      restoreEvidenceSha256: restore.evidenceSha256,
      archiveSha256: backup.archive.sha256,
      postgresMajor: backup.postgresMajor,
    },
    upgrade: {
      kind: upgrade.upgrade.kind,
      evidenceSha256: flowcordiaRecoverySha256(upgrade),
      currentMigrationCount: currentManifest.migrations.count,
      targetMigrationCount: targetManifest.migrations.count,
      pendingMigrationCount: targetManifest.migrations.count - currentManifest.migrations.count,
    },
    rollback: {
      mode: rollbackMode,
      ...(rollbackDoctor
        ? {
            restoredReleaseId: currentManifest.releaseId,
            diagnosticsSha256: rollbackDoctor.evidenceSha256,
          }
        : {}),
      recoveryRequired: rollbackMode === "restore_required",
    },
    phases: observations.phases,
    source: {
      repository: input.source.repository,
      workflowPath: FLOWCORDIA_SELF_HOST_LIFECYCLE_WORKFLOW,
      runId: input.source.runId,
      runAttempt: input.source.runAttempt,
      sourceRef: "refs/heads/main",
      sourceCommitSha: targetManifest.applicationCommitSha,
      runner: "self-hosted",
    },
  };
  if (Date.parse(evidenceWithoutDigest.checkedAt) < Date.parse(observations.completedAt)) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_assembly_time",
      "Lifecycle evidence was assembled before teardown completed."
    );
  }
  return {
    ...evidenceWithoutDigest,
    evidenceSha256: flowcordiaSelfHostLifecycleSha256(evidenceWithoutDigest),
  };
}

export function parseFlowcordiaSelfHostLifecycleEvidence(
  value: unknown
): FlowcordiaSelfHostLifecycleEvidence {
  const evidence = record(value, "Self-host lifecycle evidence");
  exactKeys(
    evidence,
    [
      "checkedAt",
      "current",
      "evidenceSha256",
      "installation",
      "kind",
      "phases",
      "recovery",
      "rollback",
      "schemaVersion",
      "source",
      "state",
      "target",
      "upgrade",
    ],
    "Self-host lifecycle evidence"
  );
  if (
    evidence.schemaVersion !== FLOWCORDIA_SELF_HOST_LIFECYCLE_SCHEMA_VERSION ||
    evidence.kind !== "flowcordia-self-host-lifecycle" ||
    evidence.state !== "READY"
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_evidence",
      "Self-host lifecycle evidence is invalid."
    );
  }
  const current = record(evidence.current, "Lifecycle current release");
  const target = record(evidence.target, "Lifecycle target release");
  const installation = record(evidence.installation, "Lifecycle installation");
  const recovery = record(evidence.recovery, "Lifecycle recovery");
  const upgrade = record(evidence.upgrade, "Lifecycle upgrade");
  const rollback = record(evidence.rollback, "Lifecycle rollback");
  const source = record(evidence.source, "Lifecycle source");
  exactKeys(
    current,
    [
      "applicationCommitSha",
      "imageDigest",
      "installDiagnosticsSha256",
      "manifestSha256",
      "migrationEvidenceSha256",
      "publicationEvidenceSha256",
      "releaseId",
      "restartDiagnosticsSha256",
      "version",
    ],
    "Lifecycle current release"
  );
  exactKeys(
    target,
    [
      "applicationCommitSha",
      "diagnosticsSha256",
      "imageDigest",
      "manifestSha256",
      "migrationEvidenceSha256",
      "publicationEvidenceSha256",
      "releaseId",
      "version",
    ],
    "Lifecycle target release"
  );
  exactKeys(
    installation,
    ["cleanDependenciesEvidenceSha256", "identityEvidenceSha256", "installationSha256"],
    "Lifecycle installation"
  );
  exactKeys(
    recovery,
    ["archiveSha256", "backupManifestSha256", "postgresMajor", "restoreEvidenceSha256"],
    "Lifecycle recovery"
  );
  exactKeys(
    upgrade,
    [
      "currentMigrationCount",
      "evidenceSha256",
      "kind",
      "pendingMigrationCount",
      "targetMigrationCount",
    ],
    "Lifecycle upgrade"
  );
  const rollbackMode = rollback.mode;
  if (rollbackMode === "application_rollback") {
    exactKeys(
      rollback,
      ["diagnosticsSha256", "mode", "recoveryRequired", "restoredReleaseId"],
      "Lifecycle rollback"
    );
  } else if (rollbackMode === "restore_required") {
    exactKeys(rollback, ["mode", "recoveryRequired"], "Lifecycle rollback");
  } else {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_rollback",
      "Lifecycle rollback mode is invalid."
    );
  }
  exactKeys(
    source,
    ["repository", "runAttempt", "runId", "runner", "sourceCommitSha", "sourceRef", "workflowPath"],
    "Lifecycle source"
  );
  const currentApplication = applicationSha(
    current.applicationCommitSha,
    "Current application revision"
  );
  const targetApplication = applicationSha(
    target.applicationCommitSha,
    "Target application revision"
  );
  const currentReleaseId = String(current.releaseId);
  const targetReleaseId = String(target.releaseId);
  const currentVersion = String(current.version);
  const targetVersion = String(target.version);
  if (
    !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(currentReleaseId) ||
    !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(targetReleaseId) ||
    currentReleaseId === targetReleaseId ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/.test(
      currentVersion
    ) ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/.test(
      targetVersion
    ) ||
    currentApplication === targetApplication ||
    digest(current.imageDigest, "Current image digest") ===
      digest(target.imageDigest, "Target image digest")
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_release_summary",
      "Lifecycle release summaries are invalid or reused."
    );
  }
  for (const [candidate, label] of [
    [current.manifestSha256, "Current manifest digest"],
    [current.publicationEvidenceSha256, "Current publication digest"],
    [current.migrationEvidenceSha256, "Current migration digest"],
    [current.installDiagnosticsSha256, "Current install diagnostics digest"],
    [current.restartDiagnosticsSha256, "Current restart diagnostics digest"],
    [target.manifestSha256, "Target manifest digest"],
    [target.publicationEvidenceSha256, "Target publication digest"],
    [target.migrationEvidenceSha256, "Target migration digest"],
    [target.diagnosticsSha256, "Target diagnostics digest"],
    [installation.identityEvidenceSha256, "Installation identity evidence digest"],
    [installation.installationSha256, "Installation identity digest"],
    [installation.cleanDependenciesEvidenceSha256, "Clean dependency evidence digest"],
    [recovery.backupManifestSha256, "Backup manifest digest"],
    [recovery.restoreEvidenceSha256, "Restore evidence digest"],
    [recovery.archiveSha256, "Backup archive digest"],
    [upgrade.evidenceSha256, "Upgrade evidence digest"],
  ] as const) {
    digest(candidate, label);
  }
  const currentMigrationCount = positiveInteger(
    upgrade.currentMigrationCount,
    "Current migration count"
  );
  const targetMigrationCount = positiveInteger(
    upgrade.targetMigrationCount,
    "Target migration count"
  );
  const pendingMigrationCount = Number(upgrade.pendingMigrationCount);
  if (
    !Number.isSafeInteger(pendingMigrationCount) ||
    pendingMigrationCount < 0 ||
    targetMigrationCount - currentMigrationCount !== pendingMigrationCount ||
    (upgrade.kind === "application_only" && pendingMigrationCount !== 0) ||
    (upgrade.kind === "append_only_migrations" && pendingMigrationCount < 1) ||
    (upgrade.kind !== "application_only" && upgrade.kind !== "append_only_migrations") ||
    (rollbackMode === "application_rollback" &&
      (upgrade.kind !== "application_only" ||
        rollback.recoveryRequired !== false ||
        rollback.restoredReleaseId !== currentReleaseId ||
        !SHA256.test(String(rollback.diagnosticsSha256)))) ||
    (rollbackMode === "restore_required" &&
      (upgrade.kind !== "append_only_migrations" || rollback.recoveryRequired !== true))
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_upgrade_summary",
      "Lifecycle upgrade and rollback summaries are inconsistent."
    );
  }
  if (!Number.isSafeInteger(recovery.postgresMajor) || Number(recovery.postgresMajor) < 14) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_recovery",
      "Lifecycle recovery PostgreSQL identity is invalid."
    );
  }
  const phases = parseObservations({
    schemaVersion: "0.1",
    kind: "flowcordia-self-host-lifecycle-observations",
    workspaceId: "000000000000",
    startedAt: (evidence.phases as Array<{ observedAt?: unknown }>)[0]?.observedAt,
    completedAt: evidence.checkedAt,
    phases: evidence.phases,
    teardown: {
      applicationContainersAbsent: true,
      applicationNetworkAbsent: true,
      applicationVolumesAbsent: true,
    },
  }).phases;
  const checkedAt = timestamp(evidence.checkedAt, "Lifecycle evidence time");
  if (Date.parse(checkedAt) < Date.parse(phases.at(-1)!.observedAt)) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_evidence_time",
      "Lifecycle evidence precedes teardown."
    );
  }
  if (
    typeof source.repository !== "string" ||
    !REPOSITORY.test(source.repository) ||
    source.repository !== source.repository.toLowerCase() ||
    source.workflowPath !== FLOWCORDIA_SELF_HOST_LIFECYCLE_WORKFLOW ||
    source.sourceRef !== "refs/heads/main" ||
    source.runner !== "self-hosted" ||
    !DECIMAL_ID.test(String(source.runId)) ||
    !Number.isSafeInteger(source.runAttempt) ||
    Number(source.runAttempt) < 1 ||
    Number(source.runAttempt) > 1000 ||
    applicationSha(source.sourceCommitSha, "Lifecycle source revision") !== targetApplication
  ) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_source",
      "Lifecycle source identity is invalid."
    );
  }
  const parsed = evidence as unknown as FlowcordiaSelfHostLifecycleEvidence;
  digest(parsed.evidenceSha256, "Lifecycle evidence digest");
  if (flowcordiaSelfHostLifecycleSha256(withoutDigest(parsed)) !== parsed.evidenceSha256) {
    throw new FlowcordiaSelfHostLifecycleError(
      "invalid_evidence_digest",
      "Self-host lifecycle evidence digest is invalid."
    );
  }
  return parsed;
}
