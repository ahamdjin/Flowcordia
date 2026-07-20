export const FLOWCORDIA_PROMOTION_CONFIRMATION = "PROMOTE_FLOWCORDIA_REFERENCE_PROPOSAL" as const;

export const FLOWCORDIA_PROMOTION_MERGE_METHODS = ["squash", "merge", "rebase"] as const;

export type FlowcordiaPromotionMergeMethod = (typeof FLOWCORDIA_PROMOTION_MERGE_METHODS)[number];

export interface FlowcordiaPromotionAcceptanceConfig {
  baseUrl: string;
  studioUrl: string;
  proposalUrl: string;
  workflowId: string;
  proposalId: string;
  expectedHeadSha: string;
  expectedApplicationCommitSha: string;
  repository: { owner: string; name: string; branch: string };
  mergeMethod: FlowcordiaPromotionMergeMethod;
  storageStatePath: string;
  evidencePath: string;
  readinessTimeoutMs: number;
  promotionTimeoutMs: number;
}

export interface FlowcordiaPromotionAcceptanceEvidence {
  schemaVersion: "0.1";
  mode: "promotion";
  result: "PASSED" | "FAILED";
  stage: "configuration" | "navigation" | "readiness" | "governance" | "promotion" | "complete";
  workflowId: string;
  proposalId: string;
  applicationCommitSha?: string;
  startedAt: string;
  completedAt: string;
  readiness?: {
    state: "READY";
    passed: number;
    blocked: 0;
    unavailable: 0;
    repository: {
      owner: string;
      name: string;
      branch: string;
      commitSha: string;
    };
  };
  governance?: {
    state: "SATISFIED";
    evaluatedHeadSha: string;
  };
  promotion?: {
    expectedHeadSha: string;
    mergeMethod: FlowcordiaPromotionMergeMethod;
    mergeCommitSha: string;
  };
  failure?: {
    code:
      | "INVALID_CONFIGURATION"
      | "NAVIGATION_FAILED"
      | "READINESS_FAILED"
      | "GOVERNANCE_FAILED"
      | "PROMOTION_FAILED";
    message: string;
  };
}

export class FlowcordiaPromotionAcceptanceConfigurationError extends Error {
  readonly code = "INVALID_CONFIGURATION";
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;
const REPOSITORY_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,255}$/;
const SHA = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER = /^\d+$/;

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(`${name} is required.`);
  }
  return value;
}

function parseBaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      "FLOWCORDIA_PROMOTION_BASE_URL must be a valid HTTPS origin."
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
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      "FLOWCORDIA_PROMOTION_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment."
    );
  }
  return parsed;
}

function relativePath(value: string, name: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.length > 1_024
  ) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      `${name} must be a bounded relative path without query or fragment.`
    );
  }
  return value;
}

function isValidGitBranch(value: string): boolean {
  if (
    !BRANCH.test(value) ||
    value === "@" ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("@{")
  ) {
    return false;
  }

  return value
    .split("/")
    .every(
      (component) =>
        component.length > 0 && !component.startsWith(".") && !component.endsWith(".lock")
    );
}

function boundedTimeout(
  environment: Record<string, string | undefined>,
  name: string,
  fallbackSeconds: number
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallbackSeconds * 1_000;
  if (!POSITIVE_INTEGER.test(raw)) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      `${name} must be a whole number of seconds.`
    );
  }
  const seconds = Number(raw);
  if (seconds < 10 || seconds > 1_800) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      `${name} must be between 10 and 1800 seconds.`
    );
  }
  return seconds * 1_000;
}

export function parseFlowcordiaPromotionAcceptanceEnvironment(
  environment: Record<string, string | undefined>
): FlowcordiaPromotionAcceptanceConfig {
  if (
    required(environment, "FLOWCORDIA_PROMOTION_CONFIRMATION") !== FLOWCORDIA_PROMOTION_CONFIRMATION
  ) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      `FLOWCORDIA_PROMOTION_CONFIRMATION must equal ${FLOWCORDIA_PROMOTION_CONFIRMATION}.`
    );
  }

  const base = parseBaseUrl(required(environment, "FLOWCORDIA_PROMOTION_BASE_URL"));
  const studioPath = relativePath(
    required(environment, "FLOWCORDIA_PROMOTION_STUDIO_PATH"),
    "FLOWCORDIA_PROMOTION_STUDIO_PATH"
  );
  const proposalPath = relativePath(
    required(environment, "FLOWCORDIA_PROMOTION_PROPOSAL_PATH"),
    "FLOWCORDIA_PROMOTION_PROPOSAL_PATH"
  );
  const workflowId = required(environment, "FLOWCORDIA_PROMOTION_WORKFLOW_ID");
  const proposalId = required(environment, "FLOWCORDIA_PROMOTION_PROPOSAL_ID");
  const expectedHeadSha = required(environment, "FLOWCORDIA_PROMOTION_EXPECTED_HEAD_SHA");
  const expectedApplicationCommitSha = required(
    environment,
    "FLOWCORDIA_PROMOTION_EXPECTED_APPLICATION_COMMIT_SHA"
  );
  const owner = required(environment, "FLOWCORDIA_PROMOTION_REPOSITORY_OWNER");
  const name = required(environment, "FLOWCORDIA_PROMOTION_REPOSITORY_NAME");
  const branch = required(environment, "FLOWCORDIA_PROMOTION_REPOSITORY_BRANCH");
  const mergeMethodValue = required(environment, "FLOWCORDIA_PROMOTION_MERGE_METHOD");

  if (!WORKFLOW_ID.test(workflowId)) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      "FLOWCORDIA_PROMOTION_WORKFLOW_ID is invalid."
    );
  }
  if (!PUBLIC_ID.test(proposalId)) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      "FLOWCORDIA_PROMOTION_PROPOSAL_ID is invalid."
    );
  }
  if (!SHA.test(expectedHeadSha)) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      "FLOWCORDIA_PROMOTION_EXPECTED_HEAD_SHA must be a 40-character lowercase commit SHA."
    );
  }
  if (!SHA.test(expectedApplicationCommitSha)) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      "FLOWCORDIA_PROMOTION_EXPECTED_APPLICATION_COMMIT_SHA must be a 40-character lowercase commit SHA."
    );
  }
  if (!REPOSITORY_NAME.test(owner) || !REPOSITORY_NAME.test(name) || !isValidGitBranch(branch)) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      "The expected reference repository identity is invalid."
    );
  }
  if (
    !FLOWCORDIA_PROMOTION_MERGE_METHODS.includes(mergeMethodValue as FlowcordiaPromotionMergeMethod)
  ) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      "FLOWCORDIA_PROMOTION_MERGE_METHOD must be squash, merge, or rebase."
    );
  }

  const storageStatePath = required(environment, "FLOWCORDIA_PROMOTION_STORAGE_STATE_PATH");
  const evidencePath = required(environment, "FLOWCORDIA_PROMOTION_EVIDENCE_PATH");
  if (storageStatePath.length > 2_048 || evidencePath.length > 2_048) {
    throw new FlowcordiaPromotionAcceptanceConfigurationError(
      "Promotion acceptance file paths must stay under 2,048 characters."
    );
  }

  const studioUrl = new URL(studioPath, base);
  studioUrl.searchParams.set("workflow", workflowId);
  const proposalUrl = new URL(proposalPath, base);
  proposalUrl.searchParams.set("proposal", proposalId);

  return {
    baseUrl: base.origin,
    studioUrl: studioUrl.toString(),
    proposalUrl: proposalUrl.toString(),
    workflowId,
    proposalId,
    expectedHeadSha,
    expectedApplicationCommitSha,
    repository: { owner, name, branch },
    mergeMethod: mergeMethodValue as FlowcordiaPromotionMergeMethod,
    storageStatePath,
    evidencePath,
    readinessTimeoutMs: boundedTimeout(
      environment,
      "FLOWCORDIA_PROMOTION_READINESS_TIMEOUT_SECONDS",
      120
    ),
    promotionTimeoutMs: boundedTimeout(environment, "FLOWCORDIA_PROMOTION_TIMEOUT_SECONDS", 300),
  };
}

export function promotionAcceptanceFailure(input: {
  stage: Exclude<FlowcordiaPromotionAcceptanceEvidence["stage"], "complete">;
  workflowId: string;
  proposalId: string;
  startedAt: string;
  completedAt: string;
}): FlowcordiaPromotionAcceptanceEvidence {
  const failureByStage = {
    configuration: {
      code: "INVALID_CONFIGURATION" as const,
      message: "Promotion acceptance configuration is invalid.",
    },
    navigation: {
      code: "NAVIGATION_FAILED" as const,
      message: "Authenticated promotion workspace navigation failed.",
    },
    readiness: {
      code: "READINESS_FAILED" as const,
      message: "The expected connected repository did not reach readiness READY.",
    },
    governance: {
      code: "GOVERNANCE_FAILED" as const,
      message: "The exact proposal head did not satisfy promotion governance.",
    },
    promotion: {
      code: "PROMOTION_FAILED" as const,
      message: "The exact governed proposal was not observed as merged.",
    },
  };
  return {
    schemaVersion: "0.1",
    mode: "promotion",
    result: "FAILED",
    stage: input.stage,
    workflowId: input.workflowId,
    proposalId: input.proposalId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    failure: failureByStage[input.stage],
  };
}
