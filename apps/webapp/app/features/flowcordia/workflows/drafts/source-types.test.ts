import { describe, expect, it } from "vitest";
import { isWorkflowDraftSourceChanged, sourceTextSha256 } from "./source-types";

function sourceRecord(sourceText: string, baseSourceText: string) {
  return {
    id: "internal-source-id",
    publicId: "11111111-1111-4111-8111-111111111111",
    draftId: "internal-draft-id",
    functionId: "qualify_lead",
    sourcePath: "src/functions/qualifyLead.ts",
    exportName: "qualifyLead",
    baseCommitSha: "a".repeat(40),
    baseBlobSha: "b".repeat(40),
    baseSourceText,
    baseSourceSha256: sourceTextSha256(baseSourceText),
    sourceText,
    sourceSha256: sourceTextSha256(sourceText),
    version: 1n,
    createdByActorId: "actor-1",
    updatedByActorId: "actor-1",
    createdAt: new Date("2026-07-18T00:00:00.000Z"),
    updatedAt: new Date("2026-07-18T00:00:00.000Z"),
  };
}

describe("workflow draft source integrity", () => {
  it("hashes UTF-8 source deterministically", () => {
    expect(sourceTextSha256("export const message = 'héllo';\n")).toBe(
      "c3bf34ad035d1f452a342c25ec6ef7e57c976d8848f93ae88e15b718c410f13e"
    );
  });

  it("distinguishes exact base content from a changed buffer", () => {
    expect(isWorkflowDraftSourceChanged(sourceRecord("export {};\n", "export {};\n"))).toBe(false);
    expect(
      isWorkflowDraftSourceChanged(
        sourceRecord("export const changed = true;\n", "export const changed = false;\n")
      )
    ).toBe(true);
  });
});
