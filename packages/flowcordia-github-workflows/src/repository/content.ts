import {
  migrateWorkflowDocument,
  serializeWorkflow,
  type WorkflowDefinition,
  type WorkflowIssue,
  type WorkflowMigration,
} from "@flowcordia/workflow";

import type { GitHubFileResult } from "../transport/client.js";

export const DEFAULT_MAX_WORKFLOW_BYTES = 1024 * 1024;

export interface EncodedWorkflow {
  text: string;
  contentBase64: string;
  byteLength: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return btoa(chunks.join(""));
}

export type DecodedWorkflowResult =
  | {
      success: true;
      text: string;
      workflow: WorkflowDefinition;
      sourceSchemaVersion?: string;
      appliedMigrations: ReadonlyArray<{ fromVersion: string; toVersion: string }>;
    }
  | { success: false; message: string; issues?: WorkflowIssue[] };

export function encodeWorkflow(workflow: WorkflowDefinition): EncodedWorkflow {
  const text = serializeWorkflow(workflow);
  const bytes = new TextEncoder().encode(text);
  return {
    text,
    contentBase64: bytesToBase64(bytes),
    byteLength: bytes.length,
  };
}

function decodeBase64File(
  file: Extract<GitHubFileResult, { found: true }>,
  maxWorkflowBytes: number
): { success: true; text: string } | { success: false; message: string } {
  if (file.size > maxWorkflowBytes) {
    return {
      success: false,
      message: `Workflow file exceeds the ${maxWorkflowBytes}-byte storage limit.`,
    };
  }

  const base64 = file.contentBase64.replace(/[\r\n\t ]/g, "");
  if (
    base64.length === 0 ||
    base64.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  ) {
    return { success: false, message: "GitHub returned malformed base64 workflow content." };
  }

  let bytes: Uint8Array;
  try {
    const binary = atob(base64);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return { success: false, message: "GitHub returned malformed base64 workflow content." };
  }
  if (bytes.length !== file.size) {
    return { success: false, message: "GitHub workflow size metadata did not match its content." };
  }

  try {
    return { success: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { success: false, message: "GitHub workflow content was not valid UTF-8." };
  }
}

export function decodeWorkflowFile(
  file: Extract<GitHubFileResult, { found: true }>,
  options: {
    maxWorkflowBytes: number;
    migrations: readonly WorkflowMigration[];
  }
): DecodedWorkflowResult {
  const decoded = decodeBase64File(file, options.maxWorkflowBytes);
  if (!decoded.success) return decoded;

  let document: unknown;
  try {
    document = JSON.parse(decoded.text);
  } catch (error) {
    return {
      success: false,
      message: "GitHub workflow file is not valid JSON.",
      issues: [
        {
          code: "invalid_json",
          message: error instanceof Error ? error.message : "Workflow is not valid JSON.",
          path: [],
          entity: { type: "workflow" },
        },
      ],
    };
  }

  const sourceSchemaVersion =
    document !== null &&
    typeof document === "object" &&
    !Array.isArray(document) &&
    typeof (document as Record<string, unknown>).schemaVersion === "string"
      ? ((document as Record<string, unknown>).schemaVersion as string)
      : undefined;
  const migrated = migrateWorkflowDocument(document, options.migrations);
  if (!migrated.success) {
    return {
      success: false,
      message: "GitHub workflow file does not satisfy the Flowcordia contract.",
      issues: migrated.issues,
    };
  }

  return {
    success: true,
    text: decoded.text,
    workflow: migrated.workflow,
    sourceSchemaVersion,
    appliedMigrations: migrated.appliedMigrations,
  };
}
