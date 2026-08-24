import type { StudioV2ReleaseProjection } from "./release-contract";
import type { StudioV2WorkspaceProjection } from "./workspace-contract";
import type { JsonValue, WorkflowSourceProject } from "@flowcordia/workflow";
import type { FlowcordiaExecutionResult } from "@flowcordia/runtime";
import type {
  StudioV2RepositoryProjection,
  StudioV2RepositoryProposalProjection,
} from "./repository-contract";

const DECIMAL_VERSION_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
const RELEASE_PUBLIC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RUN_FRIENDLY_ID_PATTERN = /^run_[A-Za-z0-9_-]{8,128}$/;
const ACTIVEPIECES_API_PATH_PATTERN = /^\/v1\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,240}$/;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const STUDIO_V2_SOURCE_MAX_LENGTH = 2_000_000;

type UnknownRecord = Record<string, unknown>;
export type StudioV2ActivepiecesApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type StudioV2WorkspaceCommand =
  | {
      intent: "save";
      expectedVersion: string;
      document: unknown;
    }
  | {
      intent: "source_save";
      expectedVersion: string;
      sourceProject: WorkflowSourceProject;
    }
  | {
      intent: "test";
      expectedVersion: string;
      input: JsonValue;
    }
  | {
      intent: "test_status";
      expectedVersion: string;
      runId: string;
    }
  | {
      intent: "cancel_test";
      expectedVersion: string;
      runId: string;
    }
  | {
      intent: "stage";
      expectedVersion: string;
    }
  | {
      intent: "repository_pull";
      expectedVersion: string;
    }
  | {
      intent: "repository_push";
      expectedVersion: string;
    }
  | {
      intent: "repository_sync";
    }
  | {
      intent: "source_test";
      expectedVersion: string;
      input: JsonValue;
    }
  | {
      intent: "deploy";
      releasePublicId: string;
    }
  | {
      intent: "rollback";
      releasePublicId: string;
    }
  | {
      intent: "activepieces_api";
      method: StudioV2ActivepiecesApiMethod;
      path: string;
      query?: UnknownRecord;
      body?: unknown;
    };

declare module "@remix-run/react" {
  interface SubmitFunction {
    (
      target: StudioV2WorkspaceCommand,
      options: { method: "post"; encType: "application/json" }
    ): Promise<void>;
  }
}

export type StudioV2SourceTestActionResult =
  | {
      status: "warming";
      message: string;
    }
  | {
      status: "completed";
      runId: string;
      success: true;
      output: unknown;
      updatedAt?: string;
    }
  | {
      status: "completed";
      runId: string;
      success: false;
      message: string;
      updatedAt?: string;
    };

export type StudioV2WorkflowTestActionResult =
  | { status: "warming"; message: string }
  | { status: "running"; runId: string; message: string }
  | {
      status: "completed";
      runId: string;
      success: boolean;
      execution: FlowcordiaExecutionResult;
    };

export type StudioV2WorkspaceActionData =
  | {
      ok: true;
      intent: "save" | "source_save";
      workspace: StudioV2WorkspaceProjection;
    }
  | {
      ok: true;
      intent: "test";
      workspace?: StudioV2WorkspaceProjection;
      test: StudioV2WorkflowTestActionResult;
    }
  | {
      ok: true;
      intent: "cancel_test";
      runId: string;
    }
  | {
      ok: true;
      intent: "source_test";
      sourceTest: StudioV2SourceTestActionResult;
    }
  | {
      ok: true;
      intent: "stage" | "deploy" | "rollback";
      release: StudioV2ReleaseProjection;
    }
  | {
      ok: true;
      intent: "repository_pull";
      workspace: StudioV2WorkspaceProjection;
      repository: StudioV2RepositoryProjection;
    }
  | {
      ok: true;
      intent: "repository_push";
      proposal: StudioV2RepositoryProposalProjection;
    }
  | {
      ok: true;
      intent: "repository_sync";
      status: string;
      commitSha: string;
      entryCount: number;
      validCount: number;
      invalidCount: number;
    }
  | {
      ok: true;
      intent: "activepieces_api";
      data: unknown;
      transport?: {
        stepRunResponse?: unknown;
      };
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export class StudioV2WorkspaceCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioV2WorkspaceCommandError";
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function parseExpectedVersion(value: unknown): string {
  if (
    typeof value !== "string" ||
    !DECIMAL_VERSION_PATTERN.test(value) ||
    BigInt(value) > POSTGRES_BIGINT_MAX
  ) {
    throw new StudioV2WorkspaceCommandError(
      "The Studio V2 workspace command must include a valid expectedVersion."
    );
  }
  return value;
}

function parseReleasePublicId(value: unknown): string {
  if (typeof value !== "string" || !RELEASE_PUBLIC_ID_PATTERN.test(value)) {
    throw new StudioV2WorkspaceCommandError(
      "The deploy command must include a valid staged releasePublicId."
    );
  }
  return value;
}

function parseRunId(value: unknown): string {
  if (typeof value !== "string" || !RUN_FRIENDLY_ID_PATTERN.test(value)) {
    throw new StudioV2WorkspaceCommandError("The Studio V2 test run id is invalid.");
  }
  return value;
}

function parseActivepiecesApiCommand(input: UnknownRecord): StudioV2WorkspaceCommand {
  const method = input.method;
  if (method !== "GET" && method !== "POST" && method !== "PATCH" && method !== "DELETE") {
    throw new StudioV2WorkspaceCommandError(
      "The Activepieces API command must include a supported HTTP method."
    );
  }
  if (typeof input.path !== "string" || !ACTIVEPIECES_API_PATH_PATTERN.test(input.path)) {
    throw new StudioV2WorkspaceCommandError(
      "The Activepieces API command must target a valid /v1 endpoint."
    );
  }
  if (input.query !== undefined && !isRecord(input.query)) {
    throw new StudioV2WorkspaceCommandError(
      "The Activepieces API command query must be an object when provided."
    );
  }
  return {
    intent: "activepieces_api",
    method,
    path: input.path,
    query: input.query,
    body: input.body,
  };
}

export function parseStudioV2WorkspaceCommand(input: unknown): StudioV2WorkspaceCommand {
  if (!isRecord(input)) {
    throw new StudioV2WorkspaceCommandError("The Studio V2 workspace command must be an object.");
  }

  if (input.intent === "activepieces_api") return parseActivepiecesApiCommand(input);
  if (input.intent === "repository_sync") return { intent: "repository_sync" };
  if (input.intent === "deploy" || input.intent === "rollback") {
    return { intent: input.intent, releasePublicId: parseReleasePublicId(input.releasePublicId) };
  }

  const expectedVersion = parseExpectedVersion(input.expectedVersion);
  if (input.intent === "test_status" || input.intent === "cancel_test") {
    return { intent: input.intent, expectedVersion, runId: parseRunId(input.runId) };
  }
  if (input.intent === "save") {
    if (!("document" in input)) {
      throw new StudioV2WorkspaceCommandError("The save command must include a workflow document.");
    }
    return { intent: "save", expectedVersion, document: input.document };
  }
  if (input.intent === "source_save") {
    if (!isRecord(input.sourceProject) || !isJsonValue(input.sourceProject)) {
      throw new StudioV2WorkspaceCommandError(
        "The source save command must include a valid TypeScript project."
      );
    }
    if (JSON.stringify(input.sourceProject).length > STUDIO_V2_SOURCE_MAX_LENGTH) {
      throw new StudioV2WorkspaceCommandError("The Source project exceeds the 2 MB limit.");
    }
    return {
      intent: "source_save",
      expectedVersion,
      sourceProject: input.sourceProject as unknown as WorkflowSourceProject,
    };
  }
  if (input.intent === "source_test" || input.intent === "test") {
    const testInput = input.input ?? null;
    if (!isJsonValue(testInput)) {
      throw new StudioV2WorkspaceCommandError(
        "The workflow test input must contain valid JSON values."
      );
    }
    return { intent: input.intent, expectedVersion, input: testInput };
  }
  if (
    input.intent === "stage" ||
    input.intent === "repository_pull" ||
    input.intent === "repository_push"
  ) {
    return { intent: input.intent, expectedVersion };
  }

  throw new StudioV2WorkspaceCommandError("The Studio V2 workspace command intent is unsupported.");
}
