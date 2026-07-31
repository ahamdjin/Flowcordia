import { describe, expect, it } from "vitest";
import { StudioV2WorkspaceCommandError, parseStudioV2WorkspaceCommand } from "./workspace-http";

const RELEASE_PUBLIC_ID = "31d43bd8-4190-4d27-a447-26f67639bb15";

describe("Studio V2 workspace HTTP commands", () => {
  it("parses optimistic save, structural test, immutable stage, and deploy commands", () => {
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "save",
        expectedVersion: "12",
        document: { schemaVersion: "0.1" },
      })
    ).toEqual({
      intent: "save",
      expectedVersion: "12",
      document: { schemaVersion: "0.1" },
    });
    expect(parseStudioV2WorkspaceCommand({ intent: "test", expectedVersion: "12" })).toEqual({
      intent: "test",
      expectedVersion: "12",
    });
    expect(parseStudioV2WorkspaceCommand({ intent: "stage", expectedVersion: "12" })).toEqual({
      intent: "stage",
      expectedVersion: "12",
    });
    expect(
      parseStudioV2WorkspaceCommand({ intent: "deploy", releasePublicId: RELEASE_PUBLIC_ID })
    ).toEqual({ intent: "deploy", releasePublicId: RELEASE_PUBLIC_ID });
  });

  it.each([
    null,
    [],
    { intent: "save", expectedVersion: "1" },
    { intent: "unknown", expectedVersion: "1" },
    { intent: "test", expectedVersion: -1 },
    { intent: "test", expectedVersion: "01" },
    { intent: "stage", expectedVersion: "9223372036854775808" },
    { intent: "deploy" },
    { intent: "deploy", releasePublicId: "not-a-release" },
    { intent: "deploy", releasePublicId: RELEASE_PUBLIC_ID.toUpperCase() },
  ])("rejects invalid commands without coercion", (command) => {
    expect(() => parseStudioV2WorkspaceCommand(command)).toThrow(StudioV2WorkspaceCommandError);
  });

  it("accepts the PostgreSQL bigint version boundary", () => {
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "stage",
        expectedVersion: "9223372036854775807",
      })
    ).toEqual({ intent: "stage", expectedVersion: "9223372036854775807" });
  });
});
