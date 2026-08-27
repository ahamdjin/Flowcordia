import { describe, expect, it } from "vitest";
import { StudioV2WorkspaceCommandError, parseStudioV2WorkspaceCommand } from "./workspace-http";

const RELEASE_PUBLIC_ID = "31d43bd8-4190-4d27-a447-26f67639bb15";

describe("Studio V2 workspace HTTP commands", () => {
  it("parses save, structural and Source tests, immutable stage, deploy, and Activepieces API commands", () => {
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "save",
        expectedVersion: "12",
        document: { schemaVersion: "0.1" },
      }),
    ).toEqual({
      intent: "save",
      expectedVersion: "12",
      document: { schemaVersion: "0.1" },
    });
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "source_save",
        expectedVersion: "12",
        sourceProject: {
          entrypoint: "/src/index.ts",
          files: { "/src/index.ts": { code: "export default async () => null;" } },
          dependencies: {},
          credentialReferences: [],
        },
      }),
    ).toEqual({
      intent: "source_save",
      expectedVersion: "12",
      sourceProject: {
        entrypoint: "/src/index.ts",
        files: { "/src/index.ts": { code: "export default async () => null;" } },
        dependencies: {},
        credentialReferences: [],
      },
    });
    expect(parseStudioV2WorkspaceCommand({ intent: "test", expectedVersion: "12" })).toEqual({
      intent: "test",
      expectedVersion: "12",
      input: null,
      retryFailedDeployment: false,
    });
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "test_status",
        expectedVersion: "12",
        runId: "run_12345678",
      }),
    ).toEqual({ intent: "test_status", expectedVersion: "12", runId: "run_12345678" });
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "cancel_test",
        expectedVersion: "12",
        runId: "run_12345678",
      }),
    ).toEqual({ intent: "cancel_test", expectedVersion: "12", runId: "run_12345678" });
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "test",
        expectedVersion: "12",
        input: { requestId: "workflow-preview" },
      }),
    ).toEqual({
      intent: "test",
      expectedVersion: "12",
      input: { requestId: "workflow-preview" },
      retryFailedDeployment: false,
    });
    expect(parseStudioV2WorkspaceCommand({ intent: "source_test", expectedVersion: "12" })).toEqual(
      {
        intent: "source_test",
        expectedVersion: "12",
        input: null,
        retryFailedDeployment: false,
      },
    );
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "source_test",
        expectedVersion: "12",
        input: { requestId: "preview", nested: [1, true, null] },
        retryFailedDeployment: true,
      }),
    ).toEqual({
      intent: "source_test",
      expectedVersion: "12",
      input: { requestId: "preview", nested: [1, true, null] },
      retryFailedDeployment: true,
    });
    expect(parseStudioV2WorkspaceCommand({ intent: "stage", expectedVersion: "12" })).toEqual({
      intent: "stage",
      expectedVersion: "12",
    });
    expect(
      parseStudioV2WorkspaceCommand({ intent: "repository_pull", expectedVersion: "12" }),
    ).toEqual({ intent: "repository_pull", expectedVersion: "12" });
    expect(
      parseStudioV2WorkspaceCommand({ intent: "repository_push", expectedVersion: "12" }),
    ).toEqual({ intent: "repository_push", expectedVersion: "12" });
    expect(parseStudioV2WorkspaceCommand({ intent: "repository_sync" })).toEqual({
      intent: "repository_sync",
    });
    expect(
      parseStudioV2WorkspaceCommand({ intent: "deploy", releasePublicId: RELEASE_PUBLIC_ID }),
    ).toEqual({ intent: "deploy", releasePublicId: RELEASE_PUBLIC_ID });
    expect(
      parseStudioV2WorkspaceCommand({ intent: "rollback", releasePublicId: RELEASE_PUBLIC_ID }),
    ).toEqual({ intent: "rollback", releasePublicId: RELEASE_PUBLIC_ID });
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "activepieces_api",
        method: "GET",
        path: "/v1/projects",
        query: { limit: 10 },
      }),
    ).toEqual({
      intent: "activepieces_api",
      method: "GET",
      path: "/v1/projects",
      query: { limit: 10 },
      body: undefined,
    });
  });

  it.each([
    null,
    [],
    { intent: "save", expectedVersion: "1" },
    { intent: "source_save", expectedVersion: "1" },
    { intent: "source_save", expectedVersion: "1", sourceProject: "invalid" },
    { intent: "unknown", expectedVersion: "1" },
    { intent: "test", expectedVersion: -1 },
    { intent: "test_status", expectedVersion: "1", runId: "invalid" },
    { intent: "cancel_test", expectedVersion: "1", runId: "run_short" },
    { intent: "test", expectedVersion: "1", input: { invalid: Number.NaN } },
    { intent: "source_test", expectedVersion: "01" },
    { intent: "source_test", expectedVersion: "1", input: { invalid: Number.NaN } },
    { intent: "source_test", expectedVersion: "1", retryFailedDeployment: "yes" },
    { intent: "test", expectedVersion: "01" },
    { intent: "stage", expectedVersion: "9223372036854775808" },
    { intent: "repository_pull", expectedVersion: "01" },
    { intent: "repository_push", expectedVersion: -1 },
    { intent: "deploy" },
    { intent: "deploy", releasePublicId: "not-a-release" },
    { intent: "deploy", releasePublicId: RELEASE_PUBLIC_ID.toUpperCase() },
    { intent: "rollback", releasePublicId: "not-a-release" },
    { intent: "activepieces_api", method: "PUT", path: "/v1/projects" },
    { intent: "activepieces_api", method: "GET", path: "https://example.com/v1/projects" },
    { intent: "activepieces_api", method: "GET", path: "/api/v1/projects" },
    { intent: "activepieces_api", method: "GET", path: "/v1/projects", query: [] },
  ])("rejects invalid commands without coercion", (command) => {
    expect(() => parseStudioV2WorkspaceCommand(command)).toThrow(StudioV2WorkspaceCommandError);
  });

  it("accepts the PostgreSQL bigint version boundary", () => {
    expect(
      parseStudioV2WorkspaceCommand({
        intent: "stage",
        expectedVersion: "9223372036854775807",
      }),
    ).toEqual({ intent: "stage", expectedVersion: "9223372036854775807" });
  });
});
