import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("cross-workflow paste service boundary", () => {
  it("re-resolves exact source draft identity and repository revision before cloning", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./service.server.ts", import.meta.url)),
      "utf8"
    );

    expect(source).toContain('input.command.type === "paste_subgraph"');
    expect(source).toContain("getActiveWorkflowDraftByPublicId(");
    expect(source).toContain("sourceDraft.workflowId !== input.command.sourceWorkflowId");
    expect(source).toContain("sourceDraft.version !== BigInt(input.command.sourceDraftVersion)");
    expect(source).toContain("sourceDraft.documentSha256 !== input.command.sourceDocumentSha256");
    expect(source).toContain("!matchesBase(sourceDraft, sourceEntry)");
    expect(source).toContain("sourceDraft.baseCommitSha !== draft.baseCommitSha");
    expect(source).toContain("pasteWorkflowSubgraph({");
    expect(source).toContain("await assertWorkflowDocumentDependencies(");
  });
});
