import { describe, expect, it } from "vitest";
import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import {
  STUDIO_V2_SOURCE_ENTRYPOINT,
  STUDIO_V2_GENERATED_SOURCE,
  STUDIO_V2_SOURCE_PACKAGE_JSON,
  createInitialStudioV2SourceWorkspace,
  createStudioV2SourceWorkspaceFromDocument,
  isWorkflowSourceFileReadOnly,
  mergeWorkflowSourceCodes,
  normalizeWorkflowSourcePath,
  normalizeWorkflowSourceWorkspace,
  resolveWorkflowSourceActiveFile,
  workflowSourcePackageJson,
  workflowSourceText,
  type WorkflowSourceWorkspace,
} from "./workspace-model";

const workspace: WorkflowSourceWorkspace = {
  entrypoint: "./src/workflows/workflow.ts",
  files: {
    "src//workflows/./workflow.ts": { code: "export const workflow = 1;" },
    "/trigger.config.ts": { code: "export {};", hidden: true, readOnly: true },
    "/src/workflows/secondary.ts": { code: "export const secondary = true;" },
  },
  dependencies: { zod: "3.25.0", "@trigger.dev/sdk": "workspace:*" },
};

describe("Studio V2 Source workspace model", () => {
  it("normalizes workspace paths without losing file metadata", () => {
    expect(normalizeWorkflowSourcePath("./src\\workflows/../workflows//workflow.ts")).toBe(
      "/src/workflows/workflow.ts"
    );

    const normalized = normalizeWorkflowSourceWorkspace(workspace);
    expect(normalized.entrypoint).toBe("/src/workflows/workflow.ts");
    expect(normalized.files["/trigger.config.ts"]).toEqual({
      code: "export {};",
      hidden: true,
      readOnly: true,
    });
  });

  it("resolves the requested active file and otherwise falls back to the entrypoint", () => {
    expect(resolveWorkflowSourceActiveFile(workspace, "src/workflows/secondary.ts")).toBe(
      "/src/workflows/secondary.ts"
    );
    expect(resolveWorkflowSourceActiveFile(workspace, "/missing.ts")).toBe(
      "/src/workflows/workflow.ts"
    );
  });

  it("updates editable files while protecting read-only files", () => {
    const merged = mergeWorkflowSourceCodes(workspace, {
      "/src/workflows/workflow.ts": "export const workflow = 2;",
      "/trigger.config.ts": "export const config = true;",
    });

    expect(merged.files["/src/workflows/workflow.ts"]?.code).toBe("export const workflow = 2;");
    expect(merged.files["/trigger.config.ts"]).toEqual({
      code: "export {};",
      hidden: true,
      readOnly: true,
    });
    expect(isWorkflowSourceFileReadOnly(merged, "/trigger.config.ts")).toBe(true);
    expect(isWorkflowSourceFileReadOnly(merged, "/src/workflows/workflow.ts")).toBe(false);
    expect(isWorkflowSourceFileReadOnly(merged, "/src/workflows/workflow.ts", true)).toBe(true);
  });

  it("generates managed package.json from the canonical dependency map", () => {
    const normalized = normalizeWorkflowSourceWorkspace({
      ...workspace,
      files: {
        ...workspace.files,
        [STUDIO_V2_SOURCE_PACKAGE_JSON]: {
          code: '{"dependencies":{"wrong":"value"}}',
        },
      },
    });

    expect(normalized.files[STUDIO_V2_SOURCE_PACKAGE_JSON]).toEqual({
      code: workflowSourcePackageJson(workspace.dependencies),
      hidden: true,
      readOnly: true,
    });
    expect(JSON.parse(normalized.files[STUDIO_V2_SOURCE_PACKAGE_JSON]!.code).dependencies).toEqual({
      "@trigger.dev/sdk": "workspace:*",
      zod: "3.25.0",
    });
  });

  it("creates a concise client-side starter draft for the workflow id", () => {
    const initial = createInitialStudioV2SourceWorkspace("workflow_123");

    expect(initial.entrypoint).toBe("/src/workflows/workflow.ts");
    expect(initial.files[initial.entrypoint]?.code).toContain("workflow_123");
    expect(initial.files[initial.entrypoint]?.code).toContain("defineWorkflow");
    expect(initial.dependencies).toEqual({ "@flowcordia/workflow": "workspace:*" });
    expect(initial.files[STUDIO_V2_SOURCE_PACKAGE_JSON]?.readOnly).toBe(true);
  });

  it("projects the complete canonical workflow into workflow.ts", () => {
    const document = createStudioV2VerticalSliceWorkflow();
    const projected = createStudioV2SourceWorkspaceFromDocument(document, document.id);
    const source = projected.workspace.files[STUDIO_V2_SOURCE_ENTRYPOINT]?.code;

    expect(source).toContain("export default defineWorkflow(");
    expect(source).toContain('"id": "studio_v2_vertical_slice"');
    expect(source).toContain('"operation": "action.http"');
    expect(source).toContain('"operation": "control.condition"');
  });

  it("adds the exact compiler artifact as a managed read-only source file", () => {
    const document = createStudioV2VerticalSliceWorkflow();
    const projected = createStudioV2SourceWorkspaceFromDocument(document, document.id, {
      documentSha256: "document-sha",
      path: STUDIO_V2_GENERATED_SOURCE,
      code: "export const generatedTask = true;\n",
      orderedNodeIds: ["manual_trigger", "source", "http_request"],
      warnings: [],
      issues: [],
    });

    expect(projected.workspace.files[STUDIO_V2_GENERATED_SOURCE]).toEqual({
      code: "export const generatedTask = true;\n",
      readOnly: true,
    });
    expect(isWorkflowSourceFileReadOnly(projected.workspace, STUDIO_V2_GENERATED_SOURCE)).toBe(
      true
    );
  });

  it("reads the editable whole-workflow source from the workspace", () => {
    const document = createStudioV2VerticalSliceWorkflow();
    const projected = createStudioV2SourceWorkspaceFromDocument(document, document.id);
    const editedSource = projected.workspace.files[STUDIO_V2_SOURCE_ENTRYPOINT]!.code.replace(
      "Studio V2 vertical slice",
      "Edited workflow"
    );
    const editedWorkspace = {
      ...projected.workspace,
      files: {
        ...projected.workspace.files,
        [STUDIO_V2_SOURCE_ENTRYPOINT]: {
          ...projected.workspace.files[STUDIO_V2_SOURCE_ENTRYPOINT],
          code: editedSource,
        },
      },
    };

    expect(workflowSourceText(editedWorkspace)).toBe(editedSource);
  });

  it("keeps Source available when a workflow has no TypeScript code node", () => {
    const verticalSlice = createStudioV2VerticalSliceWorkflow();
    const document = {
      ...verticalSlice,
      nodes: verticalSlice.nodes.filter((node) => node.operation !== "code.typescript"),
      edges: verticalSlice.edges.filter(
        (edge) => edge.source !== "source" && edge.target !== "source"
      ),
    };
    const projected = createStudioV2SourceWorkspaceFromDocument(document, document.id);

    expect(workflowSourceText(projected.workspace)).toContain("defineWorkflow");
    expect(workflowSourceText(projected.workspace)).not.toContain('"id": "source"');
  });
});
