import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import {
  createFlowcordiaProposalClosureManifest,
  parseFlowcordiaProposalClosureManifest,
  resolveFlowcordiaProposalClosure,
  serializeFlowcordiaProposalClosureManifest,
} from "../src/index.js";

const repositoryFullName = "acme/automations";
const baseCommitSha = "a".repeat(40);
const inputSchema = {
  type: "object",
  required: ["orderId"],
  properties: { orderId: { type: "string" } },
  additionalProperties: false,
} as const;
const outputSchema = {
  type: "object",
  required: ["accepted"],
  properties: { accepted: { type: "boolean" } },
  additionalProperties: false,
} as const;

function workflow(id: string, children: readonly string[] = []): WorkflowDefinition {
  const nodes: WorkflowDefinition["nodes"] = [
    {
      id: "trigger",
      kind: "trigger",
      operation: "trigger.manual",
      position: { x: 0, y: 0 },
      configuration: {},
      outputSchema: inputSchema,
    },
    ...children.map((childId, index) => ({
      id: `child-${index}`,
      kind: "subflow" as const,
      operation: "subflow.invoke",
      position: { x: 150 + index * 100, y: 0 },
      configuration: { workflowId: childId, mode: "single" },
      inputSchema,
      outputSchema,
    })),
    {
      id: "output",
      kind: "output",
      operation: "output.return",
      position: { x: 500, y: 0 },
      configuration: {},
      inputSchema: outputSchema,
    },
  ];
  return {
    schemaVersion: "0.1",
    id,
    name: id,
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({
      id: `edge-${index}`,
      source: node.id,
      target: nodes[index + 1]!.id,
    })),
  };
}

function source(workflowDefinition: WorkflowDefinition, digit: string) {
  return { workflow: workflowDefinition, baseBlobSha: digit.repeat(40) };
}

describe("Flowcordia workflow proposal closure", () => {
  it("resolves one deterministic transitive closure", () => {
    const result = resolveFlowcordiaProposalClosure({
      rootWorkflow: workflow("root", ["child-b", "child-a"]),
      descendants: [
        source(workflow("child-b", ["leaf"]), "b"),
        source(workflow("leaf"), "c"),
        source(workflow("child-a"), "d"),
      ],
      repositoryFullName,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.closure.members.map((member) => member.workflow.id)).toEqual([
      "child-a",
      "child-b",
      "leaf",
      "root",
    ]);
    expect(result.closure.members.every((member) => member.generatedSource.length > 0)).toBe(true);
  });

  it("rejects a missing reachable child", () => {
    const result = resolveFlowcordiaProposalClosure({
      rootWorkflow: workflow("root", ["missing"]),
      descendants: [],
      repositoryFullName,
    });

    expect(result).toMatchObject({
      success: false,
      issues: [expect.stringContaining('missing reachable workflow "missing"')],
    });
  });

  it("rejects unrelated workflows that are not in the root closure", () => {
    const result = resolveFlowcordiaProposalClosure({
      rootWorkflow: workflow("root"),
      descendants: [source(workflow("unrelated"), "b")],
      repositoryFullName,
    });

    expect(result).toMatchObject({
      success: false,
      issues: [expect.stringContaining('unreachable workflow "unrelated"')],
    });
  });

  it("rejects recursive workflow closures", () => {
    const result = resolveFlowcordiaProposalClosure({
      rootWorkflow: workflow("root", ["child"]),
      descendants: [source(workflow("child", ["root"]), "b")],
      repositoryFullName,
    });

    expect(result).toMatchObject({
      success: false,
      issues: [expect.stringContaining("workflow cycle")],
    });
  });

  it("rejects child bindings that drift from the exact callable contract", () => {
    const root = workflow("root", ["child"]);
    root.nodes[1]!.outputSchema = { type: "object" };
    const result = resolveFlowcordiaProposalClosure({
      rootWorkflow: root,
      descendants: [source(workflow("child"), "b")],
      repositoryFullName,
    });

    expect(result).toMatchObject({
      success: false,
      issues: [expect.stringContaining("unsafe child binding")],
    });
  });

  it("rejects repository-owned code references that point elsewhere", () => {
    const child = workflow("child");
    child.nodes.splice(1, 0, {
      id: "code",
      kind: "code",
      operation: "code.task",
      position: { x: 100, y: 0 },
      configuration: { functionId: "lookup" },
      codeReference: {
        repository: "other/repository",
        path: "src/lookup.ts",
        exportName: "lookup",
      },
      inputSchema,
      outputSchema,
    });
    child.edges = [
      { id: "trigger-code", source: "trigger", target: "code" },
      { id: "code-output", source: "code", target: "output" },
    ];
    const result = resolveFlowcordiaProposalClosure({
      rootWorkflow: workflow("root", ["child"]),
      descendants: [source(child, "b")],
      repositoryFullName,
    });

    expect(result).toMatchObject({
      success: false,
      issues: [expect.stringContaining("references another repository")],
    });
  });

  it("creates a canonical digest-bound manifest and rejects tampering", () => {
    const resolved = resolveFlowcordiaProposalClosure({
      rootWorkflow: workflow("root", ["child"]),
      descendants: [source(workflow("child"), "b")],
      repositoryFullName,
    });
    expect(resolved.success).toBe(true);
    if (!resolved.success) return;
    const manifest = createFlowcordiaProposalClosureManifest({
      proposalId: "proposal-12345678",
      baseCommitSha,
      closure: resolved.closure,
      rootBaseBlobSha: "c".repeat(40),
    });
    const parsed = parseFlowcordiaProposalClosureManifest(
      serializeFlowcordiaProposalClosureManifest(manifest)
    );
    expect(parsed).toEqual({ success: true, manifest });

    const tampered = {
      ...manifest,
      entries: manifest.entries.map((entry) =>
        entry.workflowId === "child" ? { ...entry, generatedArtifactSha256: "f".repeat(64) } : entry
      ),
    };
    expect(
      parseFlowcordiaProposalClosureManifest(serializeFlowcordiaProposalClosureManifest(tampered))
    ).toEqual({ success: false, message: "Proposal closure manifest digest is invalid." });
  });

  it("changes the closure digest when membership changes", () => {
    const first = resolveFlowcordiaProposalClosure({
      rootWorkflow: workflow("root", ["child"]),
      descendants: [source(workflow("child"), "b")],
      repositoryFullName,
    });
    const second = resolveFlowcordiaProposalClosure({
      rootWorkflow: workflow("root", ["child", "other"]),
      descendants: [source(workflow("child"), "b"), source(workflow("other"), "c")],
      repositoryFullName,
    });
    expect(first.success && second.success).toBe(true);
    if (!first.success || !second.success) return;
    const firstManifest = createFlowcordiaProposalClosureManifest({
      proposalId: "proposal-12345678",
      baseCommitSha,
      closure: first.closure,
      rootBaseBlobSha: "d".repeat(40),
    });
    const secondManifest = createFlowcordiaProposalClosureManifest({
      proposalId: "proposal-12345678",
      baseCommitSha,
      closure: second.closure,
      rootBaseBlobSha: "d".repeat(40),
    });
    expect(firstManifest.closureDigest).not.toBe(secondManifest.closureDigest);
  });
});
