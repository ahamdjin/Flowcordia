import type { StudioV2ReleaseProjection } from "./release-contract";
import type { StudioV2WorkspaceIssue, StudioV2WorkspaceProjection } from "./workspace-contract";

const DECIMAL_VERSION_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
const RELEASE_PUBLIC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTIVEPIECES_API_PATH_PATTERN = /^\/v1\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,240}$/;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

type UnknownRecord = Record<string, unknown>;
export type StudioV2ActivepiecesApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type StudioV2WorkspaceCommand =
  | {
      intent: "save";
      expectedVersion: string;
      document: unknown;
    }
  | {
      intent: "test" | "source_test" | "stage";
      expectedVersion: string;
    }
  | {
      intent: "deploy";
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

export type StudioV2WorkspaceActionData =
  | {
      ok: true;
      intent: "save";
      workspace: StudioV2WorkspaceProjection;
    }
  | {
      ok: true;
      intent: "test";
      workspace: StudioV2WorkspaceProjection;
      test: {
        success: boolean;
        version: string;
        documentSha256: string;
        issues: StudioV2WorkspaceIssue[];
      };
    }
  | {
      ok: true;
      intent: "source_test";
      sourceTest: StudioV2SourceTestActionResult;
    }
  | {
      ok: true;
      intent: "stage" | "deploy";
      release: StudioV2ReleaseProjection;
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
  if (input.intent === "deploy") {
    return { intent: "deploy", releasePublicId: parseReleasePublicId(input.releasePublicId) };
  }

  const expectedVersion = parseExpectedVersion(input.expectedVersion);
  if (input.intent === "save") {
    if (!("document" in input)) {
      throw new StudioV2WorkspaceCommandError("The save command must include a workflow document.");
    }
    return { intent: "save", expectedVersion, document: input.document };
  }
  if (input.intent === "test" || input.intent === "source_test" || input.intent === "stage") {
    return { intent: input.intent, expectedVersion };
  }

  throw new StudioV2WorkspaceCommandError("The Studio V2 workspace command intent is unsupported.");
}
