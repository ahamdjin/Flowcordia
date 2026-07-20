export const FLOWCORDIA_ROLLBACK_ACCEPTANCE_CONFIRMATION =
  "CREATE_EXACT_FLOWCORDIA_ROLLBACK_PROPOSAL_ACCEPTANCE" as const;

export interface FlowcordiaRollbackAcceptanceConfig {
  baseUrl: string;
  studioUrl: string;
  workflowId: string;
  expectedApplicationCommitSha: string;
  expectedCurrentProposalId: string;
  expectedCurrentHeadSha: string;
  expectedCurrentMergeCommitSha: string;
  expectedBaseCommitSha: string;
  expectedBaseBlobSha: string;
  targetProposalId: string;
  targetHeadSha: string;
  targetMergeCommitSha: string;
  reason: string;
  storageStatePath: string;
  evidencePath: string;
  timeoutMs: number;
}

export type FlowcordiaRollbackAcceptanceStage =
  | "configuration"
  | "navigation"
  | "identity"
  | "rollback_readiness"
  | "proposal"
  | "complete";

export interface FlowcordiaRollbackAcceptanceEvidence {
  schemaVersion: "0.1";
  mode: "rollback_proposal";
  result: "PASSED" | "FAILED";
  stage: FlowcordiaRollbackAcceptanceStage;
  workflowId: string;
  applicationCommitSha?: string;
  startedAt: string;
  completedAt: string;
  rollback?: {
    currentProposalId: string;
    currentHeadSha: string;
    currentMergeCommitSha: string;
    baseCommitSha: string;
    baseBlobSha: string;
    targetProposalId: string;
    targetHeadSha: string;
    targetMergeCommitSha: string;
    rollbackProposalId: string;
    rollbackProposalHeadSha: string;
    pullRequestNumber: number;
  };
  failure?: {
    code:
      | "INVALID_CONFIGURATION"
      | "NAVIGATION_FAILED"
      | "IDENTITY_MISMATCH"
      | "ROLLBACK_NOT_READY"
      | "PROPOSAL_FAILED";
    message: string;
  };
}

export class FlowcordiaRollbackAcceptanceConfigurationError extends Error {
  readonly code = "INVALID_CONFIGURATION";
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;
const SHA = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new FlowcordiaRollbackAcceptanceConfigurationError(`${name} is required.`);
  return value;
}

function parseOrigin(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_URL must be a valid HTTPS origin."
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
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment."
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
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "FLOWCORDIA_ROLLBACK_ACCEPTANCE_STUDIO_PATH must be a bounded relative path."
    );
  }
  return value;
}

export function parseFlowcordiaRollbackAcceptanceEnvironment(
  environment: Record<string, string | undefined>
): FlowcordiaRollbackAcceptanceConfig {
  if (
    required(environment, "FLOWCORDIA_ROLLBACK_ACCEPTANCE_CONFIRMATION") !==
    FLOWCORDIA_ROLLBACK_ACCEPTANCE_CONFIRMATION
  ) {
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      `FLOWCORDIA_ROLLBACK_ACCEPTANCE_CONFIRMATION must equal ${FLOWCORDIA_ROLLBACK_ACCEPTANCE_CONFIRMATION}.`
    );
  }

  const origin = parseOrigin(required(environment, "FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_URL"));
  const workflowId = required(environment, "FLOWCORDIA_ROLLBACK_ACCEPTANCE_WORKFLOW_ID");
  if (!WORKFLOW_ID.test(workflowId)) {
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "FLOWCORDIA_ROLLBACK_ACCEPTANCE_WORKFLOW_ID is invalid."
    );
  }

  const expectedCurrentProposalId = required(
    environment,
    "FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_PROPOSAL_ID"
  );
  const targetProposalId = required(
    environment,
    "FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_PROPOSAL_ID"
  );
  for (const [name, value] of [
    ["FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_PROPOSAL_ID", expectedCurrentProposalId],
    ["FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_PROPOSAL_ID", targetProposalId],
  ] as const) {
    if (!PUBLIC_ID.test(value)) {
      throw new FlowcordiaRollbackAcceptanceConfigurationError(`${name} is invalid.`);
    }
  }
  if (expectedCurrentProposalId === targetProposalId) {
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "Rollback current and target proposal IDs must differ."
    );
  }

  const expectedApplicationCommitSha = required(
    environment,
    "FLOWCORDIA_ROLLBACK_ACCEPTANCE_APPLICATION_COMMIT_SHA"
  );
  const expectedCurrentHeadSha = required(
    environment,
    "FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_HEAD_SHA"
  );
  const expectedCurrentMergeCommitSha = required(
    environment,
    "FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_MERGE_COMMIT_SHA"
  );
  const expectedBaseCommitSha = required(
    environment,
    "FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_COMMIT_SHA"
  );
  const expectedBaseBlobSha = required(environment, "FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_BLOB_SHA");
  const targetHeadSha = required(environment, "FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_HEAD_SHA");
  const targetMergeCommitSha = required(
    environment,
    "FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_MERGE_COMMIT_SHA"
  );
  for (const [name, value] of [
    ["FLOWCORDIA_ROLLBACK_ACCEPTANCE_APPLICATION_COMMIT_SHA", expectedApplicationCommitSha],
    ["FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_HEAD_SHA", expectedCurrentHeadSha],
    ["FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_MERGE_COMMIT_SHA", expectedCurrentMergeCommitSha],
    ["FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_COMMIT_SHA", expectedBaseCommitSha],
    ["FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_BLOB_SHA", expectedBaseBlobSha],
    ["FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_HEAD_SHA", targetHeadSha],
    ["FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_MERGE_COMMIT_SHA", targetMergeCommitSha],
  ] as const) {
    if (!SHA.test(value)) {
      throw new FlowcordiaRollbackAcceptanceConfigurationError(
        `${name} must be a 40-character lowercase Git object ID.`
      );
    }
  }
  if (expectedCurrentMergeCommitSha === targetMergeCommitSha) {
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "Rollback current and target merge commits must differ."
    );
  }

  const reason = required(environment, "FLOWCORDIA_ROLLBACK_ACCEPTANCE_REASON");
  if (reason.length > 2_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason)) {
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "FLOWCORDIA_ROLLBACK_ACCEPTANCE_REASON is invalid."
    );
  }
  const storageStatePath = required(
    environment,
    "FLOWCORDIA_ROLLBACK_ACCEPTANCE_STORAGE_STATE_PATH"
  );
  const evidencePath = required(environment, "FLOWCORDIA_ROLLBACK_ACCEPTANCE_EVIDENCE_PATH");
  if (storageStatePath.length > 2_048 || evidencePath.length > 2_048) {
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "Rollback acceptance file paths must stay under 2,048 characters."
    );
  }
  const timeoutRaw = environment.FLOWCORDIA_ROLLBACK_ACCEPTANCE_TIMEOUT_SECONDS?.trim() || "600";
  if (!POSITIVE_INTEGER.test(timeoutRaw)) {
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "FLOWCORDIA_ROLLBACK_ACCEPTANCE_TIMEOUT_SECONDS must be a whole number."
    );
  }
  const timeoutSeconds = Number(timeoutRaw);
  if (timeoutSeconds < 60 || timeoutSeconds > 1_800) {
    throw new FlowcordiaRollbackAcceptanceConfigurationError(
      "FLOWCORDIA_ROLLBACK_ACCEPTANCE_TIMEOUT_SECONDS must be between 60 and 1800 seconds."
    );
  }

  const studioUrl = new URL(
    parsePath(required(environment, "FLOWCORDIA_ROLLBACK_ACCEPTANCE_STUDIO_PATH")),
    origin
  );
  studioUrl.searchParams.set("workflow", workflowId);
  return {
    baseUrl: origin.origin,
    studioUrl: studioUrl.toString(),
    workflowId,
    expectedApplicationCommitSha,
    expectedCurrentProposalId,
    expectedCurrentHeadSha,
    expectedCurrentMergeCommitSha,
    expectedBaseCommitSha,
    expectedBaseBlobSha,
    targetProposalId,
    targetHeadSha,
    targetMergeCommitSha,
    reason,
    storageStatePath,
    evidencePath,
    timeoutMs: timeoutSeconds * 1_000,
  };
}

export function rollbackAcceptanceFailure(input: {
  stage: Exclude<FlowcordiaRollbackAcceptanceStage, "complete">;
  workflowId: string;
  startedAt: string;
  completedAt: string;
}): FlowcordiaRollbackAcceptanceEvidence {
  const failures = {
    configuration: {
      code: "INVALID_CONFIGURATION" as const,
      message: "Rollback acceptance configuration is invalid.",
    },
    navigation: {
      code: "NAVIGATION_FAILED" as const,
      message: "The protected browser could not open the expected Flowcordia Studio workflow.",
    },
    identity: {
      code: "IDENTITY_MISMATCH" as const,
      message:
        "The deployed application or current governed workflow identity did not match the operator-supplied identity.",
    },
    rollback_readiness: {
      code: "ROLLBACK_NOT_READY" as const,
      message:
        "The exact reviewed rollback target was not available from the authoritative production workflow.",
    },
    proposal: {
      code: "PROPOSAL_FAILED" as const,
      message: "The governed rollback proposal could not be created through Studio.",
    },
  };
  return {
    schemaVersion: "0.1",
    mode: "rollback_proposal",
    result: "FAILED",
    stage: input.stage,
    workflowId: input.workflowId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    failure: failures[input.stage],
  };
}
