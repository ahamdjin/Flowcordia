import { describe, expect, it } from "vitest";
import { WorkflowPasteSubgraphCommand } from "./paste-command-contract";

const validCommand = {
  type: "paste_subgraph" as const,
  sourceWorkflowId: "source_workflow",
  sourceDraftPublicId: "draft_source_123",
  sourceDraftVersion: "7",
  sourceDocumentSha256: "a".repeat(64),
  nodeIds: ["http_action", "output"],
  offset: { x: 40, y: 40 },
};

describe("cross-workflow paste command contract", () => {
  it("accepts only exact source draft identity and bounded node references", () => {
    expect(WorkflowPasteSubgraphCommand.parse(validCommand)).toEqual(validCommand);
  });

  it("rejects browser documents, duplicate identities, invalid digests, and oversized selections", () => {
    expect(
      WorkflowPasteSubgraphCommand.safeParse({ ...validCommand, browserDocument: { nodes: [] } })
        .success
    ).toBe(false);
    expect(
      WorkflowPasteSubgraphCommand.safeParse({
        ...validCommand,
        nodeIds: ["http_action", "http_action"],
      }).success
    ).toBe(false);
    expect(
      WorkflowPasteSubgraphCommand.safeParse({ ...validCommand, sourceDocumentSha256: "not-a-sha" })
        .success
    ).toBe(false);
    expect(
      WorkflowPasteSubgraphCommand.safeParse({
        ...validCommand,
        nodeIds: Array.from({ length: 101 }, (_, index) => `node_${index}`),
      }).success
    ).toBe(false);
  });
});
