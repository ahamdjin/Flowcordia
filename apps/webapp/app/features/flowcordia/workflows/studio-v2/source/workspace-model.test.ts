import { describe, expect, it } from "vitest";
import {
  STUDIO_V2_SOURCE_ENTRYPOINT,
  STUDIO_V2_SOURCE_PACKAGE_JSON,
  applyStudioV2SourceWorkspaceToDocument,
  createInitialStudioV2SourceWorkspace,
  createStudioV2SourceWorkspaceFromDocument,
  isWorkflowSourceFileReadOnly,
  mergeWorkflowSourceCodes,
  normalizeWorkflowSourcePath,
  normalizeWorkflowSourceWorkspace,
  resolveWorkflowSourceActiveFile,
  workflowSourcePackageJson,
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

function createCanonicalWorkflowDocument() {
  return {
    id: "workflow_test",
    schemaVersion: "0.1",
    nodes: [
      {
        id: "source_step",
        operation: "code.typescript",
        configuration: {
          language: "typescript",
          entrypoint: "run",
          source:
            "export default async function run(ctx: FlowcordiaContext) { return { input: ctx.input }; }",
          credentialReferences: [],
        },
      },
      {
        id: "http_request",
        operation: "action.http",
        configuration: { url: "https://example.com", method: "GET" },
      },
    ],
    edges: [],
  };
}

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
    expect(initial.files[initial.entrypoint]?.code).toContain("FlowcordiaContext");
    expect(initial.files[initial.entrypoint]?.code).not.toContain("not generated from");
    expect(initial.files[STUDIO_V2_SOURCE_PACKAGE_JSON]?.readOnly).toBe(true);
  });

  it("projects the canonical TypeScript Source node into workflow.ts", () => {
    const document = createCanonicalWorkflowDocument();
    const sourceNode = document.nodes.find((node) => node.operation === "code.typescript");
    const projected = createStudioV2SourceWorkspaceFromDocument(document, document.id);

    expect(projected.sourceNodeId).toBe(sourceNode?.id);
    expect(projected.workspace.files[STUDIO_V2_SOURCE_ENTRYPOINT]?.code).toBe(
      sourceNode?.configuration.source
    );
  });

  it("writes Source edits back to the same canonical node without replacing the workflow", () => {
    const document = createCanonicalWorkflowDocument();
    const projected = createStudioV2SourceWorkspaceFromDocument(document, document.id);
    const editedSource = `export default async function run(ctx: FlowcordiaContext) {
  return { changed: true, input: ctx.input };
}`;
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

    const applied = applyStudioV2SourceWorkspaceToDocument(
      document,
      editedWorkspace,
      projected.sourceNodeId
    );

    expect(applied.success).toBe(true);
    if (!applied.success) return;
    const nodes = applied.document.nodes as Array<Record<string, unknown>>;
    const sourceNode = nodes.find((node) => node.id === projected.sourceNodeId);
    expect((sourceNode?.configuration as Record<string, unknown>).source).toBe(editedSource);
    expect(nodes).toHaveLength(document.nodes.length);
    expect(nodes.find((node) => node.id === "http_request")?.operation).toBe("action.http");
  });

  it("refuses to save a detached Source draft without a canonical Source node", () => {
    const document = createCanonicalWorkflowDocument();
    document.nodes = document.nodes.filter((node) => node.operation !== "code.typescript");
    const projected = createStudioV2SourceWorkspaceFromDocument(document, document.id);

    expect(projected.sourceNodeId).toBeUndefined();
    expect(
      applyStudioV2SourceWorkspaceToDocument(document, projected.workspace, projected.sourceNodeId)
    ).toEqual({
      success: false,
      message: "This workflow does not contain a canonical TypeScript Source node to save.",
    });
  });
});
