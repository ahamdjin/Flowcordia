import { createStudioV2VerticalSliceWorkflow, type WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  projectStudioV2Workspace,
  validateStudioV2WorkspaceDocument,
  type StudioV2WorkspaceRecord,
} from "./workspace-contract";

function verticalSlice(): WorkflowDefinition {
  return structuredClone(createStudioV2VerticalSliceWorkflow());
}

describe("Studio V2 local workspace contract", () => {
  it("accepts the canonical local-first vertical slice", () => {
    const result = validateStudioV2WorkspaceDocument(verticalSlice());
    expect(result).toMatchObject({ success: true, issues: [] });
  });

  it("rejects operations outside the owned Studio V2 catalog", () => {
    const workflow = verticalSlice();
    workflow.nodes[1]!.operation = "developer.unowned";

    const result = validateStudioV2WorkspaceDocument(workflow);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported_operation",
          path: ["nodes", 1, "operation"],
        }),
      ])
    );
  });

  it("accepts preserved Activepieces action nodes with opaque connections", () => {
    const workflow = verticalSlice();
    workflow.nodes[1] = {
      id: "source",
      name: "Send Slack message",
      kind: "action",
      operation: "activepieces.piece.action",
      position: { x: 360, y: 160 },
      configuration: {
        activepieces: {
          stepType: "action",
          settings: {
            pieceName: "@activepieces/piece-slack",
            pieceVersion: "0.10.0",
            actionName: "send_channel_message",
            input: {},
            propertySettings: {},
          },
        },
      },
      credentialReferences: ["slack-main"],
    };

    expect(validateStudioV2WorkspaceDocument(workflow)).toMatchObject({
      success: true,
      issues: [],
    });
  });

  it("rejects inline secret-like configuration while allowing opaque references", () => {
    const workflow = verticalSlice();
    const http = workflow.nodes.find((node) => node.id === "http_request")!;
    http.configuration = {
      ...http.configuration,
      headers: { authorization: "Bearer secret-value" },
    };

    const result = validateStudioV2WorkspaceDocument(workflow);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "inline_secret",
          path: ["nodes", 2, "configuration", "headers", "authorization"],
        }),
      ])
    );
  });

  it("requires Source credential references to match the owning workflow node", () => {
    const workflow = verticalSlice();
    const source = workflow.nodes.find((node) => node.id === "source")!;
    source.credentialReferences = ["runtime-api"];

    const result = validateStudioV2WorkspaceDocument(workflow);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "source_reference_mismatch",
          path: ["nodes", 1, "credentialReferences"],
        }),
      ])
    );
  });

  it("validates the independent multi-file Source project boundary", () => {
    const workflow = verticalSlice();
    workflow.metadata = {
      sourceProject: {
        entrypoint: "/src/index.ts",
        files: {
          "/src/index.ts": { code: "export default async () => null;\n" },
          "/src/helper.ts": { code: "export const helper = true;\n" },
        },
        dependencies: { zod: "3.25.76" },
        credentialReferences: ["billing-api"],
      },
    };
    expect(validateStudioV2WorkspaceDocument(workflow)).toMatchObject({
      success: true,
      issues: [],
    });

    workflow.metadata.sourceProject!.dependencies["@trigger.dev/sdk"] = "4.5.0";
    const result = validateStudioV2WorkspaceDocument(workflow);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_source",
          path: ["metadata", "sourceProject", "dependencies", "@trigger.dev/sdk"],
        }),
      ])
    );
  });

  it("projects bigint versions without exposing internal database identity", () => {
    const workspace: StudioV2WorkspaceRecord = {
      id: "internal-id",
      publicId: "00000000-0000-4000-8000-000000000001",
      scope: {
        organizationId: "organization-id",
        projectId: "project-id",
        environmentId: "environment-id",
        workspaceKey: "default",
      },
      document: verticalSlice(),
      documentSha256: "a".repeat(64),
      version: 3n,
      testedVersion: 2n,
      lastTestSucceeded: true,
      createdByActorId: "actor-id",
      updatedByActorId: "actor-id",
      createdAt: new Date("2026-07-30T00:00:00.000Z"),
      updatedAt: new Date("2026-07-30T01:00:00.000Z"),
    };

    const projection = projectStudioV2Workspace(workspace);
    expect(projection).toMatchObject({
      publicId: workspace.publicId,
      workspaceKey: "default",
      version: "3",
      testedVersion: "2",
      lastTestSucceeded: true,
      updatedAt: "2026-07-30T01:00:00.000Z",
    });
    expect(projection).not.toHaveProperty("id");
    expect(projection).not.toHaveProperty("organizationId");
    expect(projection).not.toHaveProperty("projectId");
    expect(projection).not.toHaveProperty("environmentId");
    expect(projection).not.toHaveProperty("createdByActorId");
  });
});
