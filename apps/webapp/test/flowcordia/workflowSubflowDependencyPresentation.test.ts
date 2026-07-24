import type { WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { presentWorkflowSubflowCatalog } from "../../app/features/flowcordia/workflows/subflows/presentation";
import type { WorkflowIndexEntryRecord } from "../../app/features/flowcordia/workflows/index/types";

const commit = "a".repeat(40);

function workflow(dependency: string): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "parent",
    name: "Parent",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "child",
        kind: "subflow",
        operation: "subflow.invoke",
        position: { x: 200, y: 0 },
        configuration: { workflowId: dependency, mode: "single" },
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
      },
    ],
    edges: [],
  };
}

function entry(
  workflowId: string,
  dependencies: string[],
  overrides: Partial<WorkflowIndexEntryRecord> = {}
): WorkflowIndexEntryRecord {
  const now = new Date("2026-07-24T07:00:00.000Z");
  return {
    id: workflowId,
    workflowId,
    workflowPath: `.flowcordia/workflows/${workflowId}.json`,
    sourceCommitSha: commit,
    sourceBlobSha: "b".repeat(40),
    indexedAt: now,
    status: "VALID",
    name: workflowId,
    description: null,
    schemaVersion: "0.1",
    nodeCount: 2,
    edgeCount: 1,
    canonicalSha256: "c".repeat(64),
    dependencyMetadataVersion: 1,
    subflowWorkflowIds: dependencies,
    callableContractMetadataVersion: 1,
    callableContractState: "READY",
    callableInputSchema: { type: "object" },
    callableOutputSchema: { type: "object" },
    callableFailureCode: null,
    callableFailureMessage: null,
    failureCode: null,
    failureMessage: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Workflow subflow dependency presentation", () => {
  it("shows exact-revision eligible children and current graph readiness", () => {
    const result = presentWorkflowSubflowCatalog({
      workflow: workflow("child-a"),
      sourceCommitSha: commit,
      entries: [entry("parent", []), entry("child-a", ["child-b"]), entry("child-b", [])],
    });

    expect(result.state).toBe("READY");
    expect(result.candidates).toEqual([
      expect.objectContaining({ workflowId: "child-a", eligible: true }),
      expect.objectContaining({ workflowId: "child-b", eligible: true }),
    ]);
  });

  it("blocks stale metadata and disables children that close a cycle", () => {
    const result = presentWorkflowSubflowCatalog({
      workflow: workflow("child-a"),
      sourceCommitSha: commit,
      entries: [
        entry("parent", []),
        entry("child-a", ["parent"]),
        entry("stale-child", [], { dependencyMetadataVersion: 0 }),
      ],
    });

    expect(result.state).toBe("BLOCKED");
    expect(result.issues[0]?.code).toBe("dependency_cycle");
    expect(result.candidates.find((candidate) => candidate.workflowId === "child-a")).toMatchObject(
      {
        eligible: false,
      }
    );
    expect(
      result.candidates.find((candidate) => candidate.workflowId === "stale-child")
    ).toMatchObject({ eligible: false });
  });

  it("keeps an uncallable child visible with its bounded index explanation", () => {
    const result = presentWorkflowSubflowCatalog({
      workflow: workflow("blocked-child"),
      sourceCommitSha: commit,
      entries: [
        entry("parent", []),
        entry("blocked-child", [], {
          callableContractState: "BLOCKED",
          callableInputSchema: null,
          callableOutputSchema: null,
          callableFailureCode: "missing_output_contract",
          callableFailureMessage: "Callable workflows require one explicit output contract.",
        }),
      ],
    });

    expect(result.state).toBe("BLOCKED");
    expect(
      result.candidates.find((candidate) => candidate.workflowId === "blocked-child")
    ).toEqual(
      expect.objectContaining({
        eligible: false,
        message: "Callable workflows require one explicit output contract.",
      })
    );
    expect(result.issues[0]).toMatchObject({
      code: "child_contract_blocked",
      message: "Callable workflows require one explicit output contract.",
    });
  });

  it("blocks a current parent binding whose schemas drift from the indexed child", () => {
    const parent = workflow("child-a");
    parent.nodes[1]!.outputSchema = {
      type: "object",
      required: ["accepted"],
      properties: { accepted: { type: "boolean" } },
    };
    const result = presentWorkflowSubflowCatalog({
      workflow: parent,
      sourceCommitSha: commit,
      entries: [entry("parent", []), entry("child-a", [])],
    });

    expect(result.state).toBe("BLOCKED");
    expect(result.issues[0]?.code).toBe("contract_mismatch");
  });
});
