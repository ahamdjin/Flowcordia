import { isAbsolute } from "node:path";
import type { JsonValue } from "@flowcordia/workflow";

export const FLOWCORDIA_WEBHOOK_ACCEPTANCE_CONFIRMATION =
  "EXECUTE_EXACT_FLOWCORDIA_WEBHOOK_ACCEPTANCE" as const;

export type FlowcordiaWebhookAcceptanceStage =
  | "configuration"
  | "navigation"
  | "identity"
  | "activation"
  | "delivery"
  | "replay"
  | "invalid_signature"
  | "revocation"
  | "predecessor_closed"
  | "replacement"
  | "successor_activation"
  | "successor_delivery"
  | "complete";

export interface FlowcordiaWebhookAcceptanceConfig {
  studioUrl: string;
  workflowId: string;
  nodeId: string;
  expectedApplicationCommitSha: string;
  payload: JsonValue;
  hmacSecret: string;
  storageStatePath: string;
  evidencePath: string;
  timeoutMs: number;
}

export interface FlowcordiaWebhookAcceptanceEvidence {
  schemaVersion: "0.1";
  mode: "webhook_production";
  result: "PASSED" | "FAILED";
  stage: FlowcordiaWebhookAcceptanceStage;
  workflowId: string;
  applicationCommitSha?: string;
  startedAt: string;
  completedAt: string;
  webhook?: {
    originalGeneration: number;
    originalRevision: number;
    firstDeliveryStatus: 200 | 202;
    replayStatus: 200 | 202;
    invalidSignatureStatus: 401;
    revokedPredecessorStatus: 404;
    replacementGeneration: number;
    replacementRevision: number;
    successorDeliveryStatus: 200 | 202;
    predecessorAfterSuccessorStatus: 404;
  };
  failure?: { code: string; message: string };
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const SHA = /^[0-9a-f]{40}$/;
const MAX_PAYLOAD_BYTES = 64 * 1024;

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new TypeError(`${key} is required.`);
  return value;
}

function exactSha(value: string): boolean {
  return SHA.test(value) && !/^([0-9a-f])\1{39}$/.test(value);
}

function baseUrl(value: string): URL {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError("Webhook acceptance base URL must be an HTTPS origin.");
  }
  return parsed;
}

function studioPath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.length > 1024 ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\")
  ) {
    throw new TypeError("Webhook acceptance Studio path is invalid.");
  }
  return value;
}

function payload(value: string): JsonValue {
  if (Buffer.byteLength(value, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new TypeError("Webhook acceptance payload exceeds the bounded test limit.");
  }
  const parsed = JSON.parse(value) as unknown;
  return JSON.parse(JSON.stringify(parsed ?? null)) as JsonValue;
}

function hmacSecret(value: string): string {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < 32 || bytes > 4096 || /[\0\r\n]/.test(value)) {
    throw new TypeError("Webhook acceptance HMAC secret is invalid.");
  }
  return value;
}

function absolutePath(value: string, label: string): string {
  if (!isAbsolute(value) || value.length > 4096) {
    throw new TypeError(`${label} must be an absolute bounded path.`);
  }
  return value;
}

export function parseFlowcordiaWebhookAcceptanceEnvironment(
  environment: NodeJS.ProcessEnv
): FlowcordiaWebhookAcceptanceConfig {
  const origin = baseUrl(required(environment, "FLOWCORDIA_WEBHOOK_ACCEPTANCE_BASE_URL"));
  const path = studioPath(required(environment, "FLOWCORDIA_WEBHOOK_ACCEPTANCE_STUDIO_PATH"));
  const workflowId = required(environment, "FLOWCORDIA_WEBHOOK_ACCEPTANCE_WORKFLOW_ID");
  const nodeId = required(environment, "FLOWCORDIA_WEBHOOK_ACCEPTANCE_NODE_ID");
  const expectedApplicationCommitSha = required(
    environment,
    "FLOWCORDIA_WEBHOOK_ACCEPTANCE_APPLICATION_COMMIT_SHA"
  );
  if (!WORKFLOW_ID.test(workflowId)) throw new TypeError("Webhook acceptance workflow ID is invalid.");
  if (!NODE_ID.test(nodeId)) throw new TypeError("Webhook acceptance node ID is invalid.");
  if (!exactSha(expectedApplicationCommitSha)) {
    throw new TypeError("Webhook acceptance application revision is invalid.");
  }
  const timeoutSeconds = Number(environment.FLOWCORDIA_WEBHOOK_ACCEPTANCE_TIMEOUT_SECONDS ?? "1200");
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 120 || timeoutSeconds > 1800) {
    throw new TypeError("Webhook acceptance timeout is invalid.");
  }
  return {
    studioUrl: new URL(path, origin).toString(),
    workflowId,
    nodeId,
    expectedApplicationCommitSha,
    payload: payload(required(environment, "FLOWCORDIA_WEBHOOK_ACCEPTANCE_PAYLOAD_JSON")),
    hmacSecret: hmacSecret(required(environment, "FLOWCORDIA_WEBHOOK_ACCEPTANCE_HMAC_SECRET")),
    storageStatePath: absolutePath(
      required(environment, "FLOWCORDIA_WEBHOOK_ACCEPTANCE_STORAGE_STATE_PATH"),
      "Webhook acceptance storage state"
    ),
    evidencePath: absolutePath(
      required(environment, "FLOWCORDIA_WEBHOOK_ACCEPTANCE_EVIDENCE_PATH"),
      "Webhook acceptance evidence"
    ),
    timeoutMs: timeoutSeconds * 1000,
  };
}

export function webhookAcceptanceFailure(input: {
  stage: Exclude<FlowcordiaWebhookAcceptanceStage, "complete">;
  workflowId: string;
  startedAt: string;
  completedAt: string;
  code?: string;
}): FlowcordiaWebhookAcceptanceEvidence {
  return {
    schemaVersion: "0.1",
    mode: "webhook_production",
    result: "FAILED",
    stage: input.stage,
    workflowId: WORKFLOW_ID.test(input.workflowId) ? input.workflowId : "invalid_workflow",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    failure: {
      code: input.code ?? "WEBHOOK_ACCEPTANCE_FAILED",
      message: "The protected production webhook acceptance stage failed.",
    },
  };
}
