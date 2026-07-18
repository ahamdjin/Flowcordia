import { describe, expect, it } from "vitest";
import { presentWorkflowStudioSourceBuffer } from "./source-presentation";

const source = {
  id: "internal-source-id",
  publicId: "11111111-1111-4111-8111-111111111111",
  draftId: "internal-draft-id",
  functionId: "qualify_lead",
  sourcePath: "src/functions/qualifyLead.ts",
  exportName: "qualifyLead",
  baseCommitSha: "a".repeat(40),
  baseBlobSha: "b".repeat(40),
  baseSourceText: "export const qualifyLead = () => false;\n",
  baseSourceSha256: "c".repeat(64),
  sourceText: "export const qualifyLead = () => true;\n",
  sourceSha256: "d".repeat(64),
  version: 3n,
  createdByActorId: "actor-1",
  updatedByActorId: "actor-2",
  createdAt: new Date("2026-07-18T00:00:00.000Z"),
  updatedAt: new Date("2026-07-18T01:00:00.000Z"),
};

describe("presentWorkflowStudioSourceBuffer", () => {
  it("projects bounded source identity without source content or internal scope", () => {
    const presented = presentWorkflowStudioSourceBuffer(source);

    expect(presented).toEqual({
      publicId: source.publicId,
      functionId: "qualify_lead",
      sourcePath: "src/functions/qualifyLead.ts",
      exportName: "qualifyLead",
      version: "3",
      baseSourceSha256: "c".repeat(64),
      sourceSha256: "d".repeat(64),
      changed: true,
      updatedAt: "2026-07-18T01:00:00.000Z",
    });
    const serialized = JSON.stringify(presented);
    expect(serialized).not.toContain(source.sourceText);
    expect(serialized).not.toContain(source.baseSourceText);
    expect(serialized).not.toContain(source.id);
    expect(serialized).not.toContain(source.draftId);
    expect(serialized).not.toContain(source.createdByActorId);
  });
});
