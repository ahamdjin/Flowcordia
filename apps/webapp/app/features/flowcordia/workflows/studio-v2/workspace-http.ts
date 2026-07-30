import type {
  StudioV2WorkspaceIssue,
  StudioV2WorkspaceProjection,
} from "./workspace-contract";

const DECIMAL_VERSION_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

type UnknownRecord = Record<string, unknown>;

export type StudioV2WorkspaceCommand =
  | {
      intent: "save";
      expectedVersion: string;
      document: unknown;
    }
  | {
      intent: "test";
      expectedVersion: string;
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

export function parseStudioV2WorkspaceCommand(input: unknown): StudioV2WorkspaceCommand {
  if (!isRecord(input)) {
    throw new StudioV2WorkspaceCommandError("The Studio V2 workspace command must be an object.");
  }

  const expectedVersion = parseExpectedVersion(input.expectedVersion);
  if (input.intent === "save") {
    if (!("document" in input)) {
      throw new StudioV2WorkspaceCommandError("The save command must include a workflow document.");
    }
    return { intent: "save", expectedVersion, document: input.document };
  }
  if (input.intent === "test") {
    return { intent: "test", expectedVersion };
  }

  throw new StudioV2WorkspaceCommandError("The Studio V2 workspace command intent is unsupported.");
}
