import { describe, expect, it } from "vitest";
import {
  analyzeFlowcordiaWorkflowDependencyGraph,
  collectFlowcordiaSubflowWorkflowIds,
  evaluateFlowcordiaSubflowCandidate,
  FLOWCORDIA_DEPENDENCY_METADATA_VERSION,
  type FlowcordiaWorkflowDependencyEntry,
  type WorkflowDefinition,
} from "../src/index.js";

function workflow(id: string, dependencies: string[]): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id,
    name: id,
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      ...dependencies.map((workflowId, index) => ({
        id: `child-${index}`,
        kind: "subflow" as const,
        operation: "subflow.invoke",
        position: { x: 200 + index * 100, y: 0 },
        configuration: { workflowId, mode: "single" as const },
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
      })),
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 500, y: 0 },
        configuration: {},
      },
    ],
    edges: [],
  };
}

function entry(
  workflowId: string,
  dependencies: string[],
  overrides: Partial<FlowcordiaWorkflowDependencyEntry> = {}
): FlowcordiaWorkflowDependencyEntry {
  return {
    workflowId,
    status: "VALID",
    sourceCommitSha: "a".repeat(40),
    dependencyMetadataVersion: FLOWCORDIA_DEPENDENCY_METADATA_VERSION,
    subflowWorkflowIds: dependencies,
    ...overrides,
  };
}

describe("Flowcordia subflow dependency graph", () => {
  it("collects sorted unique child workflow IDs", () => {
    expect(
      collectFlowcordiaSubflowWorkflowIds(workflow("parent", ["child-b", "child-a", "child-b"]))
    ).toEqual(["child-a", "child-b"]);
  });

  it("accepts one exact-revision acyclic reachable graph", () => {
    expect(
      analyzeFlowcordiaWorkflowDependencyGraph({
        rootWorkflowId: "parent",
        sourceCommitSha: "a".repeat(40),
        rootSubflowWorkflowIds: ["child-a"],
        entries: [entry("parent", []), entry("child-a", ["child-b"]), entry("child-b", [])],
      })
    ).toEqual({
      success: true,
      reachableWorkflowIds: ["child-a", "child-b", "parent"],
    });
  });

  it("uses the current root document while requiring synchronized child metadata", () => {
    const result = analyzeFlowcordiaWorkflowDependencyGraph({
      rootWorkflowId: "parent",
      sourceCommitSha: "a".repeat(40),
      rootSubflowWorkflowIds: ["child"],
      entries: [entry("parent", [], { dependencyMetadataVersion: 0 }), entry("child", [])],
    });

    expect(result).toEqual({
      success: true,
      reachableWorkflowIds: ["child", "parent"],
    });
  });

  it.each([
    {
      name: "missing target",
      entries: [entry("parent", [])],
      dependency: "missing-child",
      code: "missing_target",
    },
    {
      name: "invalid target",
      entries: [entry("parent", []), entry("child", [], { status: "INVALID" })],
      dependency: "child",
      code: "invalid_target",
    },
    {
      name: "stale metadata",
      entries: [entry("parent", []), entry("child", [], { dependencyMetadataVersion: 0 })],
      dependency: "child",
      code: "stale_metadata",
    },
    {
      name: "mixed revision",
      entries: [entry("parent", []), entry("child", [], { sourceCommitSha: "b".repeat(40) })],
      dependency: "child",
      code: "mixed_revision",
    },
  ])("blocks $name", ({ entries, dependency, code }) => {
    const result = analyzeFlowcordiaWorkflowDependencyGraph({
      rootWorkflowId: "parent",
      sourceCommitSha: "a".repeat(40),
      rootSubflowWorkflowIds: [dependency],
      entries,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues[0]?.code).toBe(code);
  });

  it("reports the exact dependency cycle and disables the candidate that closes it", () => {
    const entries = [
      entry("parent", []),
      entry("child-a", ["child-b"]),
      entry("child-b", ["parent"]),
    ];
    const result = analyzeFlowcordiaWorkflowDependencyGraph({
      rootWorkflowId: "parent",
      sourceCommitSha: "a".repeat(40),
      rootSubflowWorkflowIds: ["child-a"],
      entries,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues[0]).toMatchObject({
      code: "dependency_cycle",
      path: ["parent", "child-a", "child-b", "parent"],
    });
    expect(
      evaluateFlowcordiaSubflowCandidate({
        rootWorkflowId: "parent",
        candidateWorkflowId: "child-a",
        sourceCommitSha: "a".repeat(40),
        entries,
      })
    ).toMatchObject({ eligible: false });
  });
});
