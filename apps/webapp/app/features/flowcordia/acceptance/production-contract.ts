import type { JsonValue } from "@flowcordia/workflow";

export const FLOWCORDIA_PRODUCTION_ACCEPTANCE_CONFIRMATION =
  "EXECUTE_EXACT_FLOWCORDIA_PRODUCTION_ACCEPTANCE" as const;
export const FLOWCORDIA_ROLLBACK_PRODUCTION_ACCEPTANCE_CONFIRMATION =
  "EXECUTE_EXACT_FLOWCORDIA_ROLLBACK_PRODUCTION_ACCEPTANCE" as const;

export type FlowcordiaProductionAcceptanceMode = "production" | "rollback_production";

export interface FlowcordiaProductionAcceptanceConfig {
  mode: FlowcordiaProductionAcceptanceMode;
  baseUrl: string;
  studioUrl: string;
  workflowId: string;
  proposalId: string;
  expectedApplicationCommitSha: string;
  expectedHeadSha: string;
  expectedMergeCommitSha: string;
  expectedDeploymentVersion: string;
  payload: JsonValue;
  storageStatePath: string;
  evidencePath: string;
  timeoutMs: number;
}

export type FlowcordiaProductionAcceptanceStage =
  | "configuration"
  | "navigation"
  | "identity"
  | "production_readiness"
  | "execution"
  | "proof"
  | "complete";

export interface FlowcordiaProductionAcceptanceEvidence {
  schemaVersion: "0.1";
  mode: FlowcordiaProductionAcceptanceMode;
  result: "PASSED" | "FAILED";
  stage: FlowcordiaProductionAcceptanceStage;
  workflowId: string;
  proposalId: string;
  applicationCommitSha?: string;
  startedAt: string;
  completedAt: string;
  production?: {
    expectedHeadSha: string;
    observedHeadSha: string;
    mergeCommitSha: string;
    deploymentCommitSha: string;
    deploymentVersion: string;
    run: {
      friendlyId: string;
      status: "COMPLETED_SUCCESSFULLY";
      proof: "VERIFIED";
    };
  };
  failure?: {
    code:
      | "INVALID_CONFIGURATION"
      | "NAVIGATION_FAILED"
      | "IDENTITY_MISMATCH"
      | "PRODUCTION_NOT_READY"
      | "EXECUTION_FAILED"
      | "PROOF_FAILED";
    message: string;
  };
}

export class FlowcordiaProductionAcceptanceConfigurationError extends Error {
  readonly code = "INVALID_CONFIGURATION";
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;
const SHA = /^[0-9a-f]{40}$/;
const DEPLOYMENT_VERSION = /^[A-Za-z0-9._:-]{1,128}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const MAX_PAYLOAD_BYTES = 64 * 1024;

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new FlowcordiaProductionAcceptanceConfigurationError(`${name} is required.`);
  return value;
}

function parseOrigin(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_BASE_URL must be a valid HTTPS origin."
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
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment."
    );
  }
  return parsed;
}

function parsePath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.length > 1_024
  ) {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_STUDIO_PATH must be a bounded relative path."
    );
  }
  return value;
}

function parsePayload(value: string): JsonValue {
  if (new TextEncoder().encode(value).length > MAX_PAYLOAD_BYTES) {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_PAYLOAD_JSON exceeds 64 KiB."
    );
  }
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_PAYLOAD_JSON must be valid JSON."
    );
  }
}

export function productionAcceptanceConfirmation(mode: FlowcordiaProductionAcceptanceMode): string {
  return mode === "production"
    ? FLOWCORDIA_PRODUCTION_ACCEPTANCE_CONFIRMATION
    : FLOWCORDIA_ROLLBACK_PRODUCTION_ACCEPTANCE_CONFIRMATION;
}

export function parseFlowcordiaProductionAcceptanceEnvironment(
  environment: Record<string, string | undefined>
): FlowcordiaProductionAcceptanceConfig {
  const modeValue = required(environment, "FLOWCORDIA_PRODUCTION_ACCEPTANCE_MODE");
  if (modeValue !== "production" && modeValue !== "rollback_production") {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_MODE must be production or rollback_production."
    );
  }
  const mode: FlowcordiaProductionAcceptanceMode = modeValue;
  if (
    required(environment, "FLOWCORDIA_PRODUCTION_ACCEPTANCE_CONFIRMATION") !==
    productionAcceptanceConfirmation(mode)
  ) {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      `FLOWCORDIA_PRODUCTION_ACCEPTANCE_CONFIRMATION must equal ${productionAcceptanceConfirmation(mode)}.`
    );
  }

  const origin = parseOrigin(required(environment, "FLOWCORDIA_PRODUCTION_ACCEPTANCE_BASE_URL"));
  const workflowId = required(environment, "FLOWCORDIA_PRODUCTION_ACCEPTANCE_WORKFLOW_ID");
  const proposalId = required(environment, "FLOWCORDIA_PRODUCTION_ACCEPTANCE_PROPOSAL_ID");
  const expectedApplicationCommitSha = required(
    environment,
    "FLOWCORDIA_PRODUCTION_ACCEPTANCE_APPLICATION_COMMIT_SHA"
  );
  const expectedHeadSha = required(environment, "FLOWCORDIA_PRODUCTION_ACCEPTANCE_HEAD_SHA");
  const expectedMergeCommitSha = required(
    environment,
    "FLOWCORDIA_PRODUCTION_ACCEPTANCE_MERGE_COMMIT_SHA"
  );
  const expectedDeploymentVersion = required(
    environment,
    "FLOWCORDIA_PRODUCTION_ACCEPTANCE_DEPLOYMENT_VERSION"
  );
  if (!WORKFLOW_ID.test(workflowId)) {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_WORKFLOW_ID is invalid."
    );
  }
  if (!PUBLIC_ID.test(proposalId)) {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_PROPOSAL_ID is invalid."
    );
  }
  for (const [name, value] of [
    ["FLOWCORDIA_PRODUCTION_ACCEPTANCE_APPLICATION_COMMIT_SHA", expectedApplicationCommitSha],
    ["FLOWCORDIA_PRODUCTION_ACCEPTANCE_HEAD_SHA", expectedHeadSha],
    ["FLOWCORDIA_PRODUCTION_ACCEPTANCE_MERGE_COMMIT_SHA", expectedMergeCommitSha],
  ] as const) {
    if (!SHA.test(value)) {
      throw new FlowcordiaProductionAcceptanceConfigurationError(
        `${name} must be a 40-character lowercase commit SHA.`
      );
    }
  }
  if (!DEPLOYMENT_VERSION.test(expectedDeploymentVersion)) {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_DEPLOYMENT_VERSION is invalid."
    );
  }

  const storageStatePath = required(
    environment,
    "FLOWCORDIA_PRODUCTION_ACCEPTANCE_STORAGE_STATE_PATH"
  );
  const evidencePath = required(environment, "FLOWCORDIA_PRODUCTION_ACCEPTANCE_EVIDENCE_PATH");
  if (storageStatePath.length > 2_048 || evidencePath.length > 2_048) {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "Production acceptance file paths must stay under 2,048 characters."
    );
  }
  const timeoutRaw = environment.FLOWCORDIA_PRODUCTION_ACCEPTANCE_TIMEOUT_SECONDS?.trim() || "900";
  if (!POSITIVE_INTEGER.test(timeoutRaw)) {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_TIMEOUT_SECONDS must be a whole number."
    );
  }
  const timeoutSeconds = Number(timeoutRaw);
  if (timeoutSeconds < 60 || timeoutSeconds > 1_800) {
    throw new FlowcordiaProductionAcceptanceConfigurationError(
      "FLOWCORDIA_PRODUCTION_ACCEPTANCE_TIMEOUT_SECONDS must be between 60 and 1800 seconds."
    );
  }

  const studioUrl = new URL(
    parsePath(required(environment, "FLOWCORDIA_PRODUCTION_ACCEPTANCE_STUDIO_PATH")),
    origin
  );
  studioUrl.searchParams.set("workflow", workflowId);
  return {
    mode,
    baseUrl: origin.origin,
    studioUrl: studioUrl.toString(),
    workflowId,
    proposalId,
    expectedApplicationCommitSha,
    expectedHeadSha,
    expectedMergeCommitSha,
    expectedDeploymentVersion,
    payload: parsePayload(required(environment, "FLOWCORDIA_PRODUCTION_ACCEPTANCE_PAYLOAD_JSON")),
    storageStatePath,
    evidencePath,
    timeoutMs: timeoutSeconds * 1_000,
  };
}

export function productionAcceptanceFailure(input: {
  mode: FlowcordiaProductionAcceptanceMode;
  stage: Exclude<FlowcordiaProductionAcceptanceStage, "complete">;
  workflowId: string;
  proposalId: string;
  startedAt: string;
  completedAt: string;
}): FlowcordiaProductionAcceptanceEvidence {
  const failures = {
    configuration: {
      code: "INVALID_CONFIGURATION" as const,
      message: "Production acceptance configuration is invalid.",
    },
    navigation: {
      code: "NAVIGATION_FAILED" as const,
      message: "The protected browser could not open the expected Flowcordia Studio workflow.",
    },
    identity: {
      code: "IDENTITY_MISMATCH" as const,
      message:
        "The deployed application or production workflow identity did not match the operator-supplied release identity.",
    },
    production_readiness: {
      code: "PRODUCTION_NOT_READY" as const,
      message: "The exact promoted production deployment was not ready for acceptance execution.",
    },
    execution: {
      code: "EXECUTION_FAILED" as const,
      message: "The exact promoted production run could not be started safely.",
    },
    proof: {
      code: "PROOF_FAILED" as const,
      message: "The production run did not complete with trusted verified node evidence.",
    },
  };
  return {
    schemaVersion: "0.1",
    mode: input.mode,
    result: "FAILED",
    stage: input.stage,
    workflowId: input.workflowId,
    proposalId: input.proposalId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    failure: failures[input.stage],
  };
}
