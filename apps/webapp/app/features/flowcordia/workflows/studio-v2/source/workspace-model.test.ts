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
  workflowSourceProject,
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
  credentialReferences: [],
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

  it("keeps package.json editable and derives exact dependencies from it", () => {
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
      code: '{"dependencies":{"wrong":"value"}}',
    });

    const merged = mergeWorkflowSourceCodes(normalized, {
      [STUDIO_V2_SOURCE_PACKAGE_JSON]: workflowSourcePackageJson({ zod: "3.25.0" }),
    });
    expect(merged.dependencies).toEqual({ zod: "3.25.0" });
  });

  it("creates a concise client-side starter draft for the workflow id", () => {
    const initial = createInitialStudioV2SourceWorkspace("workflow_123");

    expect(initial.entrypoint).toBe("/src/index.ts");
    expect(initial.files[initial.entrypoint]?.code).toContain("workflow_123");
    expect(initial.files[initial.entrypoint]?.code).toContain("FlowcordiaContext");
    expect(initial.dependencies).toEqual({});
    expect(initial.files[STUDIO_V2_SOURCE_PACKAGE_JSON]?.readOnly).toBeUndefined();
  });

  it("creates an independent Source project without replacing the visual workflow", () => {
    const document = createStudioV2VerticalSliceWorkflow();
    const projected = createStudioV2SourceWorkspaceFromDocument(document, document.id);
    const source = projected.workspace.files[STUDIO_V2_SOURCE_ENTRYPOINT]?.code;

    expect(source).toContain("export default async function run");
    expect(source).toContain(document.id);
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
      document.id,
      "edited_workflow"
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

    expect(workflowSourceText(projected.workspace)).toContain("export default async function run");
  });

  it("persists editable files, dependencies, and credential references", () => {
    const initial = createInitialStudioV2SourceWorkspace("workflow_123");
    initial.files["/src/helper.ts"] = { code: "export const helper = true;\n" };
    initial.files[STUDIO_V2_SOURCE_PACKAGE_JSON] = {
      code: workflowSourcePackageJson({ zod: "3.25.0" }),
    };
    initial.files["/flowcordia.json"] = {
      code: '{"entrypoint":"/src/index.ts","credentialReferences":["billing-api"]}',
    };

    expect(workflowSourceProject(initial)).toEqual({
      entrypoint: "/src/index.ts",
      files: {
        "/src/helper.ts": { code: "export const helper = true;\n" },
        "/src/index.ts": { code: initial.files["/src/index.ts"]?.code },
      },
      dependencies: { zod: "3.25.0" },
      credentialReferences: ["billing-api"],
    });
  });
});
