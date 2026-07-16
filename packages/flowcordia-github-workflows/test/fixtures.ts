import type { WorkflowDefinition } from "@flowcordia/workflow";
import {
  encodeWorkflow,
  type GitHubFileResult,
  type GitHubInstallationClientResolver,
  type GitHubRepositoryClient,
  type GitHubWorkflowAccessScope,
} from "../src/index.js";
import { vi } from "vitest";

export const BRANCH_COMMIT_SHA = "a".repeat(40);
export const CURRENT_BLOB_SHA = "b".repeat(40);
export const NEW_BLOB_SHA = "c".repeat(40);
export const NEW_COMMIT_SHA = "d".repeat(40);

export function createScope(): GitHubWorkflowAccessScope {
  return {
    tenantId: "tenant_acme",
    projectId: "project_operations",
    installationId: 4815162342,
    repository: {
      owner: "acme-enterprise",
      name: "automation",
      branch: "main",
    },
  };
}

export function createWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "order_intake",
    name: "Order intake",
    nodes: [
      {
        id: "order_created",
        kind: "trigger",
        operation: "event.receive",
        position: { x: 0, y: 0 },
        configuration: { event: "order.created" },
      },
      {
        id: "notify_team",
        kind: "action",
        operation: "slack.send-message",
        position: { x: 320, y: 0 },
        configuration: { channel: "orders" },
      },
    ],
    edges: [
      {
        id: "created_to_notify",
        source: "order_created",
        target: "notify_team",
      },
    ],
  };
}

export function workflowFile(
  workflow = createWorkflow(),
  blobSha = CURRENT_BLOB_SHA
): Extract<GitHubFileResult, { found: true }> {
  const encoded = encodeWorkflow(workflow);
  return {
    found: true,
    blobSha,
    size: encoded.byteLength,
    contentBase64: encoded.contentBase64,
  };
}

export function createClient(file: GitHubFileResult = workflowFile()) {
  return {
    resolveRevision: vi.fn(async () => ({ commitSha: BRANCH_COMMIT_SHA })),
    getFile: vi.fn(async () => file),
    putFile: vi.fn(async () => ({ commitSha: NEW_COMMIT_SHA, blobSha: NEW_BLOB_SHA })),
    deleteFile: vi.fn(async () => ({ commitSha: NEW_COMMIT_SHA })),
  } satisfies GitHubRepositoryClient;
}

export function createResolver(client: GitHubRepositoryClient) {
  return {
    resolve: vi.fn(async () => client),
  } satisfies GitHubInstallationClientResolver;
}
