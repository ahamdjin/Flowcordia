export const FLOWCORDIA_CONNECTED_ACCEPTANCE_MODES = [
  "readiness",
  "structural",
  "preview",
] as const;

export type FlowcordiaConnectedAcceptanceMode =
  (typeof FLOWCORDIA_CONNECTED_ACCEPTANCE_MODES)[number];

export interface FlowcordiaConnectedAcceptanceConfig {
  mode: FlowcordiaConnectedAcceptanceMode;
  baseUrl: string;
  studioPath: string;
  studioUrl: string;
  workflowId: string;
  storageStatePath: string;
  evidencePath: string;
  payloadText: string | null;
  expectedHeadSha: string | null;
  readinessTimeoutMs: number;
  structuralTimeoutMs: number;
  previewTimeoutMs: number;
}

export interface FlowcordiaConnectedAcceptanceEvidence {
  schemaVersion: "0.1";
  mode: FlowcordiaConnectedAcceptanceMode;
  result: "PASSED" | "FAILED";
  stage:
    | "configuration"
    | "navigation"
    | "readiness"
    | "structural"
    | "preview"
    | "complete";
  workflowId: string;
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
  structural?: { status: "PASSED" };
  preview?: {
    state: "READY";
    expectedHeadSha: string;
    observedHeadSha: string;
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
      | "READINESS_FAILED"
      | "STRUCTURAL_FAILED"
      | "PREVIEW_FAILED";
    message: string;
  };
}

export class FlowcordiaConnectedAcceptanceConfigurationError extends Error {
  readonly code = "INVALID_CONFIGURATION";
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const SHA = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER = /^\d+$/;
const MAX_PAYLOAD_BYTES = 64 * 1024;

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(`${name} is required.`);
  }
  return value;
}

function boundedTimeout(
  environment: Record<string, string | undefined>,
  name: string,
  fallbackSeconds: number
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallbackSeconds * 1_000;
  if (!POSITIVE_INTEGER.test(raw)) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      `${name} must be a whole number of seconds.`
    );
  }
  const seconds = Number(raw);
  if (seconds < 10 || seconds > 1_800) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      `${name} must be between 10 and 1800 seconds.`
    );
  }
  return seconds * 1_000;
}

function parseBaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      "FLOWCORDIA_ACCEPTANCE_BASE_URL must be a valid HTTPS origin."
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      "FLOWCORDIA_ACCEPTANCE_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment."
    );
  }
  return parsed;
}

function parseStudioPath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.length > 1_024
  ) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      "FLOWCORDIA_ACCEPTANCE_STUDIO_PATH must be a bounded relative path without query or fragment."
    );
  }
  return value;
}

function validatePayload(value: string): string {
  if (Buffer.byteLength(value, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      "FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON exceeds 64 KiB."
    );
  }
  try {
    JSON.parse(value);
  } catch {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      "FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON must contain valid JSON."
    );
  }
  return value;
}

export function parseFlowcordiaConnectedAcceptanceEnvironment(
  environment: Record<string, string | undefined>
): FlowcordiaConnectedAcceptanceConfig {
  const modeValue = required(environment, "FLOWCORDIA_ACCEPTANCE_MODE");
  if (!FLOWCORDIA_CONNECTED_ACCEPTANCE_MODES.includes(modeValue as FlowcordiaConnectedAcceptanceMode)) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      "FLOWCORDIA_ACCEPTANCE_MODE must be readiness, structural, or preview."
    );
  }
  const mode = modeValue as FlowcordiaConnectedAcceptanceMode;
  const base = parseBaseUrl(required(environment, "FLOWCORDIA_ACCEPTANCE_BASE_URL"));
  const studioPath = parseStudioPath(required(environment, "FLOWCORDIA_ACCEPTANCE_STUDIO_PATH"));
  const workflowId = required(environment, "FLOWCORDIA_ACCEPTANCE_WORKFLOW_ID");
  if (!WORKFLOW_ID.test(workflowId)) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      "FLOWCORDIA_ACCEPTANCE_WORKFLOW_ID is invalid."
    );
  }
  const storageStatePath = required(environment, "FLOWCORDIA_ACCEPTANCE_STORAGE_STATE_PATH");
  const evidencePath = required(environment, "FLOWCORDIA_ACCEPTANCE_EVIDENCE_PATH");
  if (storageStatePath.length > 2_048 || evidencePath.length > 2_048) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      "Acceptance file paths must stay under 2,048 characters."
    );
  }

  const payloadText =
    mode === "readiness"
      ? null
      : validatePayload(required(environment, "FLOWCORDIA_ACCEPTANCE_PAYLOAD_JSON"));
  const expectedHeadSha =
    mode === "preview"
      ? required(environment, "FLOWCORDIA_ACCEPTANCE_EXPECTED_HEAD_SHA")
      : null;
  if (expectedHeadSha !== null && !SHA.test(expectedHeadSha)) {
    throw new FlowcordiaConnectedAcceptanceConfigurationError(
      "FLOWCORDIA_ACCEPTANCE_EXPECTED_HEAD_SHA must be a 40-character lowercase commit SHA."
    );
  }

  const studioUrl = new URL(studioPath, base);
  studioUrl.searchParams.set("workflow", workflowId);

  return {
    mode,
    baseUrl: base.origin,
    studioPath,
    studioUrl: studioUrl.toString(),
    workflowId,
    storageStatePath,
    evidencePath,
    payloadText,
    expectedHeadSha,
    readinessTimeoutMs: boundedTimeout(
      environment,
      "FLOWCORDIA_ACCEPTANCE_READINESS_TIMEOUT_SECONDS",
      120
    ),
    structuralTimeoutMs: boundedTimeout(
      environment,
      "FLOWCORDIA_ACCEPTANCE_STRUCTURAL_TIMEOUT_SECONDS",
      180
    ),
    previewTimeoutMs: boundedTimeout(
      environment,
      "FLOWCORDIA_ACCEPTANCE_PREVIEW_TIMEOUT_SECONDS",
      900
    ),
  };
}

export function connectedAcceptanceFailure(input: {
  mode: FlowcordiaConnectedAcceptanceMode;
  stage: Exclude<FlowcordiaConnectedAcceptanceEvidence["stage"], "complete">;
  workflowId: string;
  startedAt: string;
  completedAt: string;
}): FlowcordiaConnectedAcceptanceEvidence {
  const failureByStage = {
    configuration: {
      code: "INVALID_CONFIGURATION" as const,
      message: "Connected acceptance configuration is invalid.",
    },
    navigation: {
      code: "NAVIGATION_FAILED" as const,
      message: "Connected Studio navigation or authentication failed.",
    },
    readiness: {
      code: "READINESS_FAILED" as const,
      message: "Connected repository readiness did not reach READY.",
    },
    structural: {
      code: "STRUCTURAL_FAILED" as const,
      message: "Structural preview did not produce a passing result.",
    },
    preview: {
      code: "PREVIEW_FAILED" as const,
      message: "Exact-head live preview proof was not verified.",
    },
  };
  return {
    schemaVersion: "0.1",
    mode: input.mode,
    result: "FAILED",
    stage: input.stage,
    workflowId: input.workflowId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    failure: failureByStage[input.stage],
  };
}
