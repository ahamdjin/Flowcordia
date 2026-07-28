import { flowcordiaRecoverySha256 } from "./database-recovery";

export const FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_WORKFLOW =
  ".github/workflows/flowcordia-clean-install-onboarding.yml" as const;

export const FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS = [
  "clean_install",
  "owner_created",
  "password_login",
  "platform_ready",
  "email_configured",
  "organization_created",
  "project_created",
  "github_app_configured",
  "github_installation_linked",
  "repository_connected",
  "workflow_synchronized",
  "deployment_completed",
  "second_user_invited",
  "second_user_signed_in",
] as const;

export type FlowcordiaCleanInstallOnboardingStep =
  (typeof FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS)[number];

type JourneyStep = {
  key: FlowcordiaCleanInstallOnboardingStep;
  state: "READY";
  observedAt: string;
};

export interface FlowcordiaCleanInstallOnboardingObservations {
  schemaVersion: "0.1";
  kind: "flowcordia-clean-install-onboarding-observations";
  workspaceId: string;
  startedAt: string;
  completedAt: string;
  release: {
    releaseId: string;
    version: string;
    applicationCommitSha: string;
    imageDigest: string;
    manifestSha256: string;
    publicationEvidenceSha256: string;
  };
  fixture: {
    githubAppIdSha256: string;
    githubInstallationIdSha256: string;
    referenceRepositorySha256: string;
    referenceBranchSha256: string;
    referenceCommitSha: string;
    secondUserEmailSha256: string;
  };
  deployment: {
    projectRefSha256: string;
    deploymentVersionSha256: string;
    sourceCommitSha: string;
  };
  journey: JourneyStep[];
  teardown: {
    containersAbsent: true;
    networksAbsent: true;
    volumesAbsent: true;
    browserStateAbsent: true;
    mailboxAbsent: true;
    temporaryCredentialsAbsent: true;
  };
}

export interface FlowcordiaCleanInstallOnboardingEvidence
  extends FlowcordiaCleanInstallOnboardingObservations {
  kind: "flowcordia-clean-install-onboarding";
  state: "READY";
  checkedAt: string;
  source: {
    repository: string;
    workflowPath: typeof FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_WORKFLOW;
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

type UnknownRecord = Record<string, unknown>;

export class FlowcordiaCleanInstallOnboardingError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaCleanInstallOnboardingError";
  }
}

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaCleanInstallOnboardingError("invalid_object", `${label} is invalid.`);
  }
  return value as UnknownRecord;
}

function exactKeys(value: UnknownRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new FlowcordiaCleanInstallOnboardingError(
      "unexpected_fields",
      `${label} has unexpected fields.`
    );
  }
}

function bounded(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new FlowcordiaCleanInstallOnboardingError("invalid_string", `${label} is invalid.`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new FlowcordiaCleanInstallOnboardingError("invalid_time", `${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaCleanInstallOnboardingError("invalid_time", `${label} is invalid.`);
  }
  return value;
}

function sha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA.test(value) || /^([0-9a-f])\1{39}$/.test(value)) {
    throw new FlowcordiaCleanInstallOnboardingError("invalid_sha", `${label} is invalid.`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value) || /^([0-9a-f])\1{63}$/.test(value)) {
    throw new FlowcordiaCleanInstallOnboardingError("invalid_digest", `${label} is invalid.`);
  }
  return value;
}

function parseJourney(value: unknown, startedAt: string, completedAt: string): JourneyStep[] {
  if (!Array.isArray(value) || value.length !== FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS.length) {
    throw new FlowcordiaCleanInstallOnboardingError(
      "invalid_journey",
      "The onboarding journey is incomplete."
    );
  }
  let previous = new Date(startedAt).getTime();
  return value
    .map((candidate, index) => {
      const step = record(candidate, `journey.${index}`);
      exactKeys(step, ["key", "observedAt", "state"], `journey.${index}`);
      const expected = FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS[index];
      const observedAt = timestamp(step.observedAt, `journey.${index}.observedAt`);
      const time = new Date(observedAt).getTime();
      if (step.key !== expected || step.state !== "READY" || time < previous) {
        throw new FlowcordiaCleanInstallOnboardingError(
          "invalid_journey",
          `The onboarding journey is invalid at ${expected}.`
        );
      }
      previous = time;
      return { key: expected, state: "READY" as const, observedAt };
    })
    .map((step) => {
      if (new Date(step.observedAt).getTime() > new Date(completedAt).getTime()) {
        throw new FlowcordiaCleanInstallOnboardingError(
          "invalid_journey",
          "The onboarding journey exceeds its completion time."
        );
      }
      return step;
    });
}

export function parseFlowcordiaCleanInstallOnboardingObservations(
  value: unknown
): FlowcordiaCleanInstallOnboardingObservations {
  const root = record(value, "observations");
  exactKeys(
    root,
    [
      "completedAt",
      "deployment",
      "fixture",
      "journey",
      "kind",
      "release",
      "schemaVersion",
      "startedAt",
      "teardown",
      "workspaceId",
    ],
    "observations"
  );
  if (
    root.schemaVersion !== FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_SCHEMA_VERSION ||
    root.kind !== "flowcordia-clean-install-onboarding-observations" ||
    typeof root.workspaceId !== "string" ||
    !WORKSPACE_ID.test(root.workspaceId)
  ) {
    throw new FlowcordiaCleanInstallOnboardingError(
      "invalid_observations",
      "The onboarding observations identity is invalid."
    );
  }
  const startedAt = timestamp(root.startedAt, "observations.startedAt");
  const completedAt = timestamp(root.completedAt, "observations.completedAt");
  if (new Date(completedAt).getTime() < new Date(startedAt).getTime()) {
    throw new FlowcordiaCleanInstallOnboardingError(
      "invalid_chronology",
      "The onboarding completion precedes its start."
    );
  }

  const release = record(root.release, "observations.release");
  exactKeys(
    release,
    [
      "applicationCommitSha",
      "imageDigest",
      "manifestSha256",
      "publicationEvidenceSha256",
      "releaseId",
      "version",
    ],
    "observations.release"
  );
  const fixture = record(root.fixture, "observations.fixture");
  exactKeys(
    fixture,
    [
      "githubAppIdSha256",
      "githubInstallationIdSha256",
      "referenceBranchSha256",
      "referenceCommitSha",
      "referenceRepositorySha256",
      "secondUserEmailSha256",
    ],
    "observations.fixture"
  );
  const deployment = record(root.deployment, "observations.deployment");
  exactKeys(
    deployment,
    ["deploymentVersionSha256", "projectRefSha256", "sourceCommitSha"],
    "observations.deployment"
  );
  const teardown = record(root.teardown, "observations.teardown");
  exactKeys(
    teardown,
    [
      "browserStateAbsent",
      "containersAbsent",
      "mailboxAbsent",
      "networksAbsent",
      "temporaryCredentialsAbsent",
      "volumesAbsent",
    ],
    "observations.teardown"
  );
  for (const key of Object.keys(teardown)) {
    if (teardown[key] !== true) {
      throw new FlowcordiaCleanInstallOnboardingError(
        "incomplete_teardown",
        `The onboarding teardown check ${key} is not READY.`
      );
    }
  }

  return {
    schemaVersion: "0.1",
    kind: "flowcordia-clean-install-onboarding-observations",
    workspaceId: root.workspaceId,
    startedAt,
    completedAt,
    release: {
      releaseId: bounded(release.releaseId, "observations.release.releaseId", 100),
      version: bounded(release.version, "observations.release.version", 100),
      applicationCommitSha: sha(
        release.applicationCommitSha,
        "observations.release.applicationCommitSha"
      ),
      imageDigest: digest(release.imageDigest, "observations.release.imageDigest"),
      manifestSha256: digest(release.manifestSha256, "observations.release.manifestSha256"),
      publicationEvidenceSha256: digest(
        release.publicationEvidenceSha256,
        "observations.release.publicationEvidenceSha256"
      ),
    },
    fixture: {
      githubAppIdSha256: digest(fixture.githubAppIdSha256, "observations.fixture.githubAppIdSha256"),
      githubInstallationIdSha256: digest(
        fixture.githubInstallationIdSha256,
        "observations.fixture.githubInstallationIdSha256"
      ),
      referenceRepositorySha256: digest(
        fixture.referenceRepositorySha256,
        "observations.fixture.referenceRepositorySha256"
      ),
      referenceBranchSha256: digest(
        fixture.referenceBranchSha256,
        "observations.fixture.referenceBranchSha256"
      ),
      referenceCommitSha: sha(
        fixture.referenceCommitSha,
        "observations.fixture.referenceCommitSha"
      ),
      secondUserEmailSha256: digest(
        fixture.secondUserEmailSha256,
        "observations.fixture.secondUserEmailSha256"
      ),
    },
    deployment: {
      projectRefSha256: digest(
        deployment.projectRefSha256,
        "observations.deployment.projectRefSha256"
      ),
      deploymentVersionSha256: digest(
        deployment.deploymentVersionSha256,
        "observations.deployment.deploymentVersionSha256"
      ),
      sourceCommitSha: sha(deployment.sourceCommitSha, "observations.deployment.sourceCommitSha"),
    },
    journey: parseJourney(root.journey, startedAt, completedAt),
    teardown: {
      containersAbsent: true,
      networksAbsent: true,
      volumesAbsent: true,
      browserStateAbsent: true,
      mailboxAbsent: true,
      temporaryCredentialsAbsent: true,
    },
  };
}

export function flowcordiaCleanInstallOnboardingSha256(
  evidence: Omit<FlowcordiaCleanInstallOnboardingEvidence, "evidenceSha256">
): string {
  return flowcordiaRecoverySha256(evidence);
}

export function assembleFlowcordiaCleanInstallOnboardingEvidence(input: {
  observations: unknown;
  checkedAt: string;
  repository: string;
  runId: string;
  runAttempt: number;
  sourceCommitSha: string;
}): FlowcordiaCleanInstallOnboardingEvidence {
  const observations = parseFlowcordiaCleanInstallOnboardingObservations(input.observations);
  if (!REPOSITORY.test(input.repository)) {
    throw new FlowcordiaCleanInstallOnboardingError(
      "invalid_repository",
      "The evidence source repository is invalid."
    );
  }
  if (
    !DECIMAL_ID.test(input.runId) ||
    !Number.isSafeInteger(input.runAttempt) ||
    input.runAttempt < 1
  ) {
    throw new FlowcordiaCleanInstallOnboardingError(
      "invalid_workflow",
      "The evidence workflow identity is invalid."
    );
  }
  const checkedAt = timestamp(input.checkedAt, "evidence.checkedAt");
  const sourceCommitSha = sha(input.sourceCommitSha, "evidence.source.sourceCommitSha");
  if (observations.release.applicationCommitSha !== sourceCommitSha) {
    throw new FlowcordiaCleanInstallOnboardingError(
      "release_mismatch",
      "The clean-install release is not the exact workflow source revision."
    );
  }
  const evidenceWithoutDigest: Omit<FlowcordiaCleanInstallOnboardingEvidence, "evidenceSha256"> = {
    ...observations,
    kind: "flowcordia-clean-install-onboarding",
    state: "READY",
    checkedAt,
    source: {
      repository: input.repository,
      workflowPath: FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_WORKFLOW,
      runId: input.runId,
      runAttempt: input.runAttempt,
      sourceRef: "refs/heads/main",
      sourceCommitSha,
      runner: "self-hosted",
    },
  };
  return {
    ...evidenceWithoutDigest,
    evidenceSha256: flowcordiaCleanInstallOnboardingSha256(evidenceWithoutDigest),
  };
}

export function parseFlowcordiaCleanInstallOnboardingEvidence(
  value: unknown
): FlowcordiaCleanInstallOnboardingEvidence {
  const root = record(value, "evidence");
  exactKeys(
    root,
    [
      "checkedAt",
      "completedAt",
      "deployment",
      "evidenceSha256",
      "fixture",
      "journey",
      "kind",
      "release",
      "schemaVersion",
      "source",
      "startedAt",
      "state",
      "teardown",
      "workspaceId",
    ],
    "evidence"
  );
  if (root.kind !== "flowcordia-clean-install-onboarding" || root.state !== "READY") {
    throw new FlowcordiaCleanInstallOnboardingError(
      "invalid_evidence",
      "The clean-install onboarding evidence is not READY."
    );
  }
  const source = record(root.source, "evidence.source");
  exactKeys(
    source,
    [
      "repository",
      "runAttempt",
      "runId",
      "runner",
      "sourceCommitSha",
      "sourceRef",
      "workflowPath",
    ],
    "evidence.source"
  );
  const parsed = assembleFlowcordiaCleanInstallOnboardingEvidence({
    observations: {
      schemaVersion: root.schemaVersion,
      kind: "flowcordia-clean-install-onboarding-observations",
      workspaceId: root.workspaceId,
      startedAt: root.startedAt,
      completedAt: root.completedAt,
      release: root.release,
      fixture: root.fixture,
      deployment: root.deployment,
      journey: root.journey,
      teardown: root.teardown,
    },
    checkedAt: timestamp(root.checkedAt, "evidence.checkedAt"),
    repository: bounded(source.repository, "evidence.source.repository", 140),
    runId: bounded(source.runId, "evidence.source.runId", 20),
    runAttempt: Number(source.runAttempt),
    sourceCommitSha: bounded(source.sourceCommitSha, "evidence.source.sourceCommitSha", 40),
  });
  if (
    source.workflowPath !== FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_WORKFLOW ||
    source.sourceRef !== "refs/heads/main" ||
    source.runner !== "self-hosted" ||
    root.evidenceSha256 !== parsed.evidenceSha256
  ) {
    throw new FlowcordiaCleanInstallOnboardingError(
      "invalid_evidence",
      "The clean-install onboarding evidence identity or digest is invalid."
    );
  }
  return parsed;
}
