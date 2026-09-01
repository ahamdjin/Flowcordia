import { describe, expect, it } from "vitest";
import { parseFlowcordiaActivepiecesPieceConfiguration } from "./activepieces.js";
import { workflowStudioNodeCatalogEntry } from "./catalog.js";
import {
  createDisabledStudioV2SourceControlProvider,
  createStudioV2LifecycleState,
  transitionStudioV2Lifecycle,
} from "./studio-v2-lifecycle.js";
import {
  STUDIO_V2_SOURCE_OPERATION,
  createStudioV2SourceNode,
  validateStudioV2SourceDocument,
} from "./studio-v2-source.js";
import {
  STUDIO_V2_FOUNDATION_NODE_IDS,
  STUDIO_V2_FOUNDATION_NODES,
  createStudioV2VerticalSliceWorkflow,
} from "./studio-v2.js";
import { validateWorkflow } from "./validation.js";

function requireSuccessfulTransition(result: ReturnType<typeof transitionStudioV2Lifecycle>) {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.message);
  return result.state;
}

describe("Studio V2 foundation catalog", () => {
  it("tracks each imported node foundation exactly once", () => {
    expect(STUDIO_V2_FOUNDATION_NODES).toHaveLength(14);
    expect(new Set(STUDIO_V2_FOUNDATION_NODES.map((entry) => entry.id)).size).toBe(14);
    expect(STUDIO_V2_FOUNDATION_NODES.map((entry) => entry.id)).toEqual(
      STUDIO_V2_FOUNDATION_NODE_IDS
    );
  });

  it("keeps canonical Flowcordia operations for native nodes", () => {
    for (const entry of STUDIO_V2_FOUNDATION_NODES) {
      if (entry.templateId === undefined) continue;
      const canonical = workflowStudioNodeCatalogEntry(entry.templateId);
      expect(entry.operation).toBe(canonical.operation);
      expect(entry.kind).toBe(canonical.kind);
      expect(entry.availableInStudio).toBe(true);
    }
  });

  it("exposes imported helper nodes through preserved Activepieces settings", () => {
    const activepiecesBacked = STUDIO_V2_FOUNDATION_NODES.filter(
      (entry) => entry.availability === "activepieces"
    );
    expect(activepiecesBacked.map((entry) => entry.id)).toEqual(["math", "text", "date", "store"]);
    for (const entry of activepiecesBacked) {
      const node = {
        id: entry.id,
        kind: entry.kind,
        operation: entry.operation,
        position: { x: 0, y: 0 },
        configuration: entry.defaultConfiguration,
      };
      expect(entry.availableInStudio).toBe(true);
      expect(parseFlowcordiaActivepiecesPieceConfiguration(node).success).toBe(true);
    }

    const adapterRequired = STUDIO_V2_FOUNDATION_NODES.filter(
      (entry) => entry.availability === "adapter_required"
    );
    expect(adapterRequired).toEqual([]);
  });
});

describe("Studio V2 TypeScript Source", () => {
  it("creates a TypeScript-only node with opaque credential references", () => {
    const node = createStudioV2SourceNode({
      id: "source",
      position: { x: 100, y: 100 },
      credentialReferences: ["api-token"],
    });

    expect(node.operation).toBe(STUDIO_V2_SOURCE_OPERATION);
    expect(node.kind).toBe("code");
    expect(node.credentialReferences).toEqual(["api-token"]);
    expect(node.configuration).toMatchObject({
      language: "typescript",
      entrypoint: "run",
      credentialReferences: ["api-token"],
    });
    expect(JSON.stringify(node.configuration)).not.toContain("secret-value");
  });

  it("rejects other languages, raw credential properties, and invalid references", () => {
    const result = validateStudioV2SourceDocument({
      language: "javascript",
      entrypoint: "main",
      source: "return true",
      credentialReferences: ["Bad Reference"],
      credentials: { token: "secret-value" },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid_language",
        "invalid_entrypoint",
        "invalid_credential_references",
        "unknown_property",
      ])
    );
  });
});

describe("Studio V2 vertical slice", () => {
  it("builds Manual to Source to HTTP to Condition with explicit branch outputs", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    expect(workflow.nodes.map((node) => node.operation)).toEqual([
      "trigger.manual",
      "code.typescript",
      "action.http",
      "control.condition",
      "output.return",
      "output.return",
    ]);
    expect(workflow.edges).toHaveLength(5);
    expect(workflow.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "condition", sourceHandle: "true" }),
        expect.objectContaining({ source: "condition", sourceHandle: "false" }),
      ])
    );
    const source = workflow.nodes.find((node) => node.id === "source");
    expect(source).toBeDefined();
    expect(validateStudioV2SourceDocument(source!.configuration).success).toBe(true);
    expect(validateWorkflow(workflow)).toMatchObject({ success: true, issues: [] });
  });
});

describe("Studio V2 local-first lifecycle", () => {
  it("saves, tests, stages, and deploys without a source-control provider", async () => {
    let state = createStudioV2LifecycleState();
    state = requireSuccessfulTransition(transitionStudioV2Lifecycle(state, { type: "begin_test" }));
    state = requireSuccessfulTransition(
      transitionStudioV2Lifecycle(state, { type: "complete_test", success: true })
    );
    state = requireSuccessfulTransition(
      transitionStudioV2Lifecycle(state, { type: "promote_to_staging" })
    );
    state = requireSuccessfulTransition(transitionStudioV2Lifecycle(state, { type: "deploy" }));

    expect(state).toMatchObject({
      phase: "deployed",
      revision: 1,
      testedRevision: 1,
      stagedRevision: 1,
      deployedRevision: 1,
    });

    const sourceControl = createDisabledStudioV2SourceControlProvider();
    await expect(sourceControl.status()).resolves.toEqual({
      available: false,
      connected: false,
    });
    await expect(sourceControl.push(state.revision)).resolves.toMatchObject({
      success: false,
      code: "provider_unavailable",
    });
  });

  it("requires the current revision to pass testing before staging", () => {
    const state = createStudioV2LifecycleState();
    const promotion = transitionStudioV2Lifecycle(state, { type: "promote_to_staging" });
    expect(promotion).toMatchObject({ success: false, code: "untested_revision" });
  });
});
