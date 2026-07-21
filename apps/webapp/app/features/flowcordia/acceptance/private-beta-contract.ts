export const FLOWCORDIA_PRIVATE_BETA_CONFIRMATION =
  "STANDARD_NON_MAINTAINER_ZERO_INTERVENTION" as const;

export interface FlowcordiaPrivateBetaIdentity {
  platformAdmin: false;
  superCapability: false;
  impersonating: false;
}

export interface FlowcordiaPrivateBetaOperatorAttestation {
  repositoryMaintainerAccount: false;
  maintainerInterventionCount: 0;
}

export interface FlowcordiaPrivateBetaConfig {
  baseUrl: string;
  studioUrl: string;
  workflowId: string;
  storageStatePath: string;
  evidencePath: string;
  payloadText: string;
  replacementName: string;
  expectedApplicationCommitSha: string;
  journeyTimeoutMs: number;
  operatorAttestation: FlowcordiaPrivateBetaOperatorAttestation;
}

export type FlowcordiaPrivateBetaStage =
  | "configuration"
  | "navigation"
  | "identity"
  | "draft"
  | "edit"
  | "structural_test"
  | "proposal"
  | "complete";

export interface FlowcordiaPrivateBetaStepEvidence {
  stage: Exclude<FlowcordiaPrivateBetaStage, "configuration" | "complete">;
  result: "PASSED";
  durationMs: number;
}

export interface FlowcordiaPrivateBetaProposalEvidence {
  proposalId: string;
  proposalHeadSha: string;
  pullRequestNumber: number;
}

export interface FlowcordiaPrivateBetaFailureEvidence {
  code:
    | "INVALID_CONFIGURATION"
    | "NAVIGATION_FAILED"
    | "IDENTITY_FAILED"
    | "DRAFT_FAILED"
    | "EDIT_FAILED"
    | "STRUCTURAL_TEST_FAILED"
    | "PROPOSAL_FAILED";
  message: string;
}

interface FlowcordiaPrivateBetaEvidenceBase {
  schemaVersion: "0.2";
  mode: "private_beta_author_journey";
  workflowId: string;
  startedAt: string;
  completedAt: string;
}

export type FlowcordiaPrivateBetaEvidence =
  | (FlowcordiaPrivateBetaEvidenceBase & {
      result: "PASSED";
      stage: "complete";
      applicationCommitSha: string;
      identity: FlowcordiaPrivateBetaIdentity;
      operatorAttestation: FlowcordiaPrivateBetaOperatorAttestation;
      steps: FlowcordiaPrivateBetaStepEvidence[];
      proposal: FlowcordiaPrivateBetaProposalEvidence;
      failure?: never;
    })
  | (FlowcordiaPrivateBetaEvidenceBase & {
      result: "FAILED";
      stage: Exclude<FlowcordiaPrivateBetaStage, "complete">;
      applicationCommitSha?: string;
      identity?: FlowcordiaPrivateBetaIdentity;
      operatorAttestation?: FlowcordiaPrivateBetaOperatorAttestation;
      steps?: FlowcordiaPrivateBetaStepEvidence[];
      proposal?: never;
      failure: FlowcordiaPrivateBetaFailureEvidence;
    });

export class FlowcordiaPrivateBetaConfigurationError extends Error {
  readonly code = "INVALID_CONFIGURATION";
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const SHA = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const MAX_PAYLOAD_BYTES = 64 * 1024;

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new FlowcordiaPrivateBetaConfigurationError(`${name} is required.`);
  return value;
}

function parseBaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_BASE_URL must be a valid HTTPS origin."
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment."
    );
  }
  return parsed;
}

function parseStudioPath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    !value.endsWith("/flowcordia/workflows") ||
    value.includes("?") ||
    value.includes("#") ||
    value.length > 1_024
  ) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_STUDIO_PATH must be a bounded relative Workflow Studio path."
    );
  }
  return value;
}

function parsePrivatePath(value: string, name: string): string {
  if (!value.startsWith("/") || value.includes("\0") || value.length > 2_048) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      `${name} must be a bounded absolute runner path.`
    );
  }
  return value;
}

function parsePayload(value: string): string {
  if (new TextEncoder().encode(value).length > MAX_PAYLOAD_BYTES) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_PAYLOAD_JSON exceeds 64 KiB."
    );
  }
  try {
    JSON.parse(value);
  } catch {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_PAYLOAD_JSON must be valid JSON."
    );
  }
  return value;
}

function parseOperatorAttestation(
  environment: Record<string, string | undefined>
): FlowcordiaPrivateBetaOperatorAttestation {
  if (
    required(environment, "FLOWCORDIA_PRIVATE_BETA_CONFIRMATION") !==
    FLOWCORDIA_PRIVATE_BETA_CONFIRMATION
  ) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      `FLOWCORDIA_PRIVATE_BETA_CONFIRMATION must equal ${FLOWCORDIA_PRIVATE_BETA_CONFIRMATION}.`
    );
  }
  if (required(environment, "FLOWCORDIA_PRIVATE_BETA_REPOSITORY_MAINTAINER") !== "false") {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "Private beta author acceptance requires a non-maintainer repository account."
    );
  }
  if (required(environment, "FLOWCORDIA_PRIVATE_BETA_ASSISTANCE_COUNT") !== "0") {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "Private beta author acceptance requires zero maintainer interventions during the recorded journey."
    );
  }
  return { repositoryMaintainerAccount: false, maintainerInterventionCount: 0 };
}

export function parseFlowcordiaPrivateBetaEnvironment(
  environment: Record<string, string | undefined>
): FlowcordiaPrivateBetaConfig {
  const operatorAttestation = parseOperatorAttestation(environment);
  const origin = parseBaseUrl(required(environment, "FLOWCORDIA_PRIVATE_BETA_BASE_URL"));
  const workflowId = required(environment, "FLOWCORDIA_PRIVATE_BETA_WORKFLOW_ID");
  if (!WORKFLOW_ID.test(workflowId)) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_WORKFLOW_ID is invalid."
    );
  }
  const replacementName = required(environment, "FLOWCORDIA_PRIVATE_BETA_REPLACEMENT_NAME");
  if (replacementName.length > 160) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_REPLACEMENT_NAME must contain at most 160 characters."
    );
  }
  const expectedApplicationCommitSha = required(
    environment,
    "FLOWCORDIA_PRIVATE_BETA_EXPECTED_APPLICATION_COMMIT_SHA"
  );
  if (!SHA.test(expectedApplicationCommitSha)) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_EXPECTED_APPLICATION_COMMIT_SHA must be a 40-character lowercase commit SHA."
    );
  }
  const storageStatePath = parsePrivatePath(
    required(environment, "FLOWCORDIA_PRIVATE_BETA_STORAGE_STATE_PATH"),
    "FLOWCORDIA_PRIVATE_BETA_STORAGE_STATE_PATH"
  );
  const evidencePath = parsePrivatePath(
    required(environment, "FLOWCORDIA_PRIVATE_BETA_EVIDENCE_PATH"),
    "FLOWCORDIA_PRIVATE_BETA_EVIDENCE_PATH"
  );
  const payloadText = parsePayload(required(environment, "FLOWCORDIA_PRIVATE_BETA_PAYLOAD_JSON"));
  const timeoutRaw = environment.FLOWCORDIA_PRIVATE_BETA_TIMEOUT_SECONDS?.trim() || "600";
  if (!POSITIVE_INTEGER.test(timeoutRaw)) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_TIMEOUT_SECONDS must be a whole number."
    );
  }
  const timeoutSeconds = Number(timeoutRaw);
  if (timeoutSeconds < 60 || timeoutSeconds > 1_800) {
    throw new FlowcordiaPrivateBetaConfigurationError(
      "FLOWCORDIA_PRIVATE_BETA_TIMEOUT_SECONDS must be between 60 and 1800 seconds."
    );
  }
  const studioUrl = new URL(
    parseStudioPath(required(environment, "FLOWCORDIA_PRIVATE_BETA_STUDIO_PATH")),
    origin
  );
  studioUrl.searchParams.set("workflow", workflowId);
  return {
    baseUrl: origin.origin,
    studioUrl: studioUrl.toString(),
    workflowId,
    storageStatePath,
    evidencePath,
    payloadText,
    replacementName,
    expectedApplicationCommitSha,
    journeyTimeoutMs: timeoutSeconds * 1_000,
    operatorAttestation,
  };
}

export function privateBetaFailure(input: {
  stage: Exclude<FlowcordiaPrivateBetaStage, "complete">;
  workflowId: string;
  startedAt: string;
  completedAt: string;
  applicationCommitSha?: string;
  identity?: FlowcordiaPrivateBetaIdentity;
  operatorAttestation?: FlowcordiaPrivateBetaOperatorAttestation;
  steps?: FlowcordiaPrivateBetaStepEvidence[];
}): FlowcordiaPrivateBetaEvidence {
  const failureByStage = {
    configuration: {
      code: "INVALID_CONFIGURATION" as const,
      message: "Private beta author journey configuration is invalid.",
    },
    navigation: {
      code: "NAVIGATION_FAILED" as const,
      message: "The acceptance browser could not open the expected connected Studio workflow.",
    },
    identity: {
      code: "IDENTITY_FAILED" as const,
      message: "The browser session did not satisfy the standard-account identity boundary.",
    },
    draft: {
      code: "DRAFT_FAILED" as const,
      message: "The standard account could not start or resume a durable workflow draft.",
    },
    edit: {
      code: "EDIT_FAILED" as const,
      message: "The standard account could not complete the bounded workflow edit.",
    },
    structural_test: {
      code: "STRUCTURAL_TEST_FAILED" as const,
      message: "The edited draft did not pass structural preview.",
    },
    proposal: {
      code: "PROPOSAL_FAILED" as const,
      message: "The standard account could not publish the exact draft as a governed proposal.",
    },
  };
  return {
    schemaVersion: "0.2",
    mode: "private_beta_author_journey",
    result: "FAILED",
    stage: input.stage,
    workflowId: input.workflowId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(input.applicationCommitSha ? { applicationCommitSha: input.applicationCommitSha } : {}),
    ...(input.identity ? { identity: input.identity } : {}),
    ...(input.operatorAttestation ? { operatorAttestation: input.operatorAttestation } : {}),
    ...(input.steps ? { steps: input.steps } : {}),
    failure: failureByStage[input.stage],
  };
}
