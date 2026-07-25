export const FLOWCORDIA_PRODUCTION_IDENTITY_CONFIRMATION =
  "DISCOVER_EXACT_FLOWCORDIA_PRODUCTION_IDENTITY" as const;

export interface FlowcordiaProductionIdentityConfig {
  baseUrl: string;
  studioUrl: string;
  workflowId: string;
  proposalId: string;
  expectedApplicationCommitSha: string;
  expectedHeadSha: string;
  expectedMergeCommitSha: string;
  storageStatePath: string;
  evidencePath: string;
  timeoutMs: number;
}

export interface FlowcordiaProductionIdentityEvidence {
  schemaVersion: "0.1";
  mode: "production_identity";
  result: "PASSED" | "FAILED";
  stage: "configuration" | "navigation" | "waiting" | "identity" | "complete";
  workflowId: string;
  proposalId: string;
  applicationCommitSha?: string;
  startedAt: string;
  completedAt: string;
  production?: {
    headSha: string;
    mergeCommitSha: string;
    deploymentCommitSha: string;
    deploymentVersion: string;
    closureDigest: string;
    closureWorkflowCount: number;
    rollbackBaseCommitSha: string;
    rollbackBaseBlobSha: string;
  };
  failure?: {
    code:
      | "INVALID_CONFIGURATION"
      | "NAVIGATION_FAILED"
      | "PRODUCTION_NOT_READY"
      | "IDENTITY_MISMATCH";
    message: string;
  };
}

export class FlowcordiaProductionIdentityConfigurationError extends Error {
  readonly code = "INVALID_CONFIGURATION";
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;
const SHA = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function required(environment: Record<string, string | undefined>, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new FlowcordiaProductionIdentityConfigurationError(`${key} is required.`);
  return value;
}

function parseOrigin(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlowcordiaProductionIdentityConfigurationError(
      "FLOWCORDIA_PRODUCTION_IDENTITY_BASE_URL must be an HTTPS origin."
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
    throw new FlowcordiaProductionIdentityConfigurationError(
      "FLOWCORDIA_PRODUCTION_IDENTITY_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment."
    );
  }
  return parsed;
}

function relativePath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.length > 1_024
  ) {
    throw new FlowcordiaProductionIdentityConfigurationError(
      "FLOWCORDIA_PRODUCTION_IDENTITY_STUDIO_PATH must be a bounded relative path."
    );
  }
  return value;
}

export function parseFlowcordiaProductionIdentityEnvironment(
  environment: Record<string, string | undefined>
): FlowcordiaProductionIdentityConfig {
  if (
    required(environment, "FLOWCORDIA_PRODUCTION_IDENTITY_CONFIRMATION") !==
    FLOWCORDIA_PRODUCTION_IDENTITY_CONFIRMATION
  ) {
    throw new FlowcordiaProductionIdentityConfigurationError(
      `FLOWCORDIA_PRODUCTION_IDENTITY_CONFIRMATION must equal ${FLOWCORDIA_PRODUCTION_IDENTITY_CONFIRMATION}.`
    );
  }
  const base = parseOrigin(required(environment, "FLOWCORDIA_PRODUCTION_IDENTITY_BASE_URL"));
  const studioPath = relativePath(
    required(environment, "FLOWCORDIA_PRODUCTION_IDENTITY_STUDIO_PATH")
  );
  const workflowId = required(environment, "FLOWCORDIA_PRODUCTION_IDENTITY_WORKFLOW_ID");
  const proposalId = required(environment, "FLOWCORDIA_PRODUCTION_IDENTITY_PROPOSAL_ID");
  const expectedApplicationCommitSha = required(
    environment,
    "FLOWCORDIA_PRODUCTION_IDENTITY_APPLICATION_COMMIT_SHA"
  );
  const expectedHeadSha = required(environment, "FLOWCORDIA_PRODUCTION_IDENTITY_HEAD_SHA");
  const expectedMergeCommitSha = required(
    environment,
    "FLOWCORDIA_PRODUCTION_IDENTITY_MERGE_COMMIT_SHA"
  );
  if (!WORKFLOW_ID.test(workflowId)) {
    throw new FlowcordiaProductionIdentityConfigurationError(
      "FLOWCORDIA_PRODUCTION_IDENTITY_WORKFLOW_ID is invalid."
    );
  }
  if (!PUBLIC_ID.test(proposalId)) {
    throw new FlowcordiaProductionIdentityConfigurationError(
      "FLOWCORDIA_PRODUCTION_IDENTITY_PROPOSAL_ID is invalid."
    );
  }
  for (const [key, value] of [
    ["FLOWCORDIA_PRODUCTION_IDENTITY_APPLICATION_COMMIT_SHA", expectedApplicationCommitSha],
    ["FLOWCORDIA_PRODUCTION_IDENTITY_HEAD_SHA", expectedHeadSha],
    ["FLOWCORDIA_PRODUCTION_IDENTITY_MERGE_COMMIT_SHA", expectedMergeCommitSha],
  ] as const) {
    if (!SHA.test(value)) {
      throw new FlowcordiaProductionIdentityConfigurationError(`${key} is invalid.`);
    }
  }
  const storageStatePath = required(
    environment,
    "FLOWCORDIA_PRODUCTION_IDENTITY_STORAGE_STATE_PATH"
  );
  const evidencePath = required(environment, "FLOWCORDIA_PRODUCTION_IDENTITY_EVIDENCE_PATH");
  if (storageStatePath.length > 2_048 || evidencePath.length > 2_048) {
    throw new FlowcordiaProductionIdentityConfigurationError(
      "Production identity file paths must stay under 2,048 characters."
    );
  }
  const rawTimeout = environment.FLOWCORDIA_PRODUCTION_IDENTITY_TIMEOUT_SECONDS?.trim() ?? "1200";
  if (!POSITIVE_INTEGER.test(rawTimeout)) {
    throw new FlowcordiaProductionIdentityConfigurationError(
      "FLOWCORDIA_PRODUCTION_IDENTITY_TIMEOUT_SECONDS must be a whole number."
    );
  }
  const timeoutSeconds = Number(rawTimeout);
  if (timeoutSeconds < 30 || timeoutSeconds > 3_600) {
    throw new FlowcordiaProductionIdentityConfigurationError(
      "FLOWCORDIA_PRODUCTION_IDENTITY_TIMEOUT_SECONDS must be between 30 and 3600."
    );
  }
  const studioUrl = new URL(studioPath, base);
  studioUrl.searchParams.set("workflow", workflowId);
  return {
    baseUrl: base.origin,
    studioUrl: studioUrl.toString(),
    workflowId,
    proposalId,
    expectedApplicationCommitSha,
    expectedHeadSha,
    expectedMergeCommitSha,
    storageStatePath,
    evidencePath,
    timeoutMs: timeoutSeconds * 1_000,
  };
}

export function productionIdentityFailure(input: {
  stage: Exclude<FlowcordiaProductionIdentityEvidence["stage"], "complete">;
  workflowId: string;
  proposalId: string;
  startedAt: string;
  completedAt: string;
  applicationCommitSha?: string;
}): FlowcordiaProductionIdentityEvidence {
  const codes = {
    configuration: "INVALID_CONFIGURATION",
    navigation: "NAVIGATION_FAILED",
    waiting: "PRODUCTION_NOT_READY",
    identity: "IDENTITY_MISMATCH",
  } as const;
  return {
    schemaVersion: "0.1",
    mode: "production_identity",
    result: "FAILED",
    stage: input.stage,
    workflowId: input.workflowId,
    proposalId: input.proposalId,
    applicationCommitSha: input.applicationCommitSha,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    failure: {
      code: codes[input.stage],
      message: "Production identity discovery failed safely.",
    },
  };
}
