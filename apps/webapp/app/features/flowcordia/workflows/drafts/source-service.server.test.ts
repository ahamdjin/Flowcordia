import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compileWorkflowToTriggerTask: vi.fn(),
  getActiveWorkflowDraftByPublicId: vi.fn(),
  getWorkflowIndexEntry: vi.fn(),
  createWorkflowIndexGitHubGateway: vi.fn(),
  createOrResumeWorkflowDraftSourceFile: vi.fn(),
  getChangedWorkflowDraftSourceFiles: vi.fn(),
  getWorkflowDraftSourceFileByPublicId: vi.fn(),
  getWorkflowDraftSourceFiles: vi.fn(),
  resetWorkflowDraftSourceFile: vi.fn(),
  updateWorkflowDraftSourceFile: vi.fn(),
}));

vi.mock("@flowcordia/runtime", () => ({
  compileWorkflowToTriggerTask: mocks.compileWorkflowToTriggerTask,
}));
vi.mock("../index/github.server", () => ({
  createWorkflowIndexGitHubGateway: mocks.createWorkflowIndexGitHubGateway,
}));
vi.mock("../index/repository.server", () => ({
  getWorkflowIndexEntry: mocks.getWorkflowIndexEntry,
}));
vi.mock("./repository.server", () => ({
  getActiveWorkflowDraftByPublicId: mocks.getActiveWorkflowDraftByPublicId,
}));
vi.mock("./source-repository.server", () => ({
  createOrResumeWorkflowDraftSourceFile: mocks.createOrResumeWorkflowDraftSourceFile,
  getChangedWorkflowDraftSourceFiles: mocks.getChangedWorkflowDraftSourceFiles,
  getWorkflowDraftSourceFileByPublicId: mocks.getWorkflowDraftSourceFileByPublicId,
  getWorkflowDraftSourceFiles: mocks.getWorkflowDraftSourceFiles,
  resetWorkflowDraftSourceFile: mocks.resetWorkflowDraftSourceFile,
  updateWorkflowDraftSourceFile: mocks.updateWorkflowDraftSourceFile,
}));

import {
  getPublishableWorkflowDraftSourcePatches,
  getPublishableWorkflowDraftWithSourceChanges,
  startWorkflowDraftSource,
} from "./source-service.server";
import { sourceTextSha256 } from "./source-types";

const scope = {
  tenantId: "org-1",
  projectId: "project-1",
  githubAppInstallationId: "github-installation-1",
  installationId: 100,
  repositoryId: "repository-1",
  repositoryGithubId: "200",
  repository: { owner: "acme", name: "workflow-repo", branch: "main" },
};
const baseCommitSha = "a".repeat(40);
const baseBlobSha = "b".repeat(40);
const canonicalSha256 = "c".repeat(64);
const sourceBlobSha = "d".repeat(40);
const sourceText = "export async function qualifyLead() { return { qualified: true }; }\n";
const workflow = {
  schemaVersion: "0.1" as const,
  id: "lead_intake",
  name: "Lead intake",
  labels: [],
  nodes: [
    {
      id: "qualify_lead",
      kind: "code" as const,
      operation: "code.task",
      position: { x: 100, y: 100 },
      name: "Qualify lead",
      configuration: { functionId: "qualify_lead" },
      codeReference: {
        path: "src/functions/qualifyLead.ts",
        exportName: "qualifyLead",
      },
    },
  ],
  edges: [],
};
const draft = {
  id: "internal-draft-id",
  publicId: "11111111-1111-4111-8111-111111111111",
  workflowId: "lead_intake",
  workflowPath: ".flowcordia/workflows/lead_intake.json",
  baseCommitSha,
  baseBlobSha,
  baseCanonicalSha256: canonicalSha256,
  document: workflow,
  documentSha256: canonicalSha256,
  version: 3n,
};

function validIndexEntry() {
  return {
    status: "VALID",
    sourceCommitSha: baseCommitSha,
    sourceBlobSha: baseBlobSha,
    canonicalSha256,
  };
}

function sourceRecord(
  path = "src/functions/qualifyLead.ts",
  text = sourceText,
  publicId = "22222222-2222-4222-8222-222222222222"
) {
  const baseSourceText = "export async function qualifyLead() { return { qualified: false }; }\n";
  return {
    id: `source-${path}`,
    publicId,
    draftId: draft.id,
    functionId: "qualify_lead",
    sourcePath: path,
    exportName: "qualifyLead",
    baseCommitSha,
    baseBlobSha: sourceBlobSha,
    baseSourceText,
    baseSourceSha256: sourceTextSha256(baseSourceText),
    sourceText: text,
    sourceSha256: sourceTextSha256(text),
    version: 2n,
    createdByActorId: "actor-1",
    updatedByActorId: "actor-1",
    createdAt: new Date("2026-07-18T00:00:00.000Z"),
    updatedAt: new Date("2026-07-18T01:00:00.000Z"),
  };
}

function expectedSource(source: ReturnType<typeof sourceRecord>) {
  return {
    publicId: source.publicId,
    version: source.version,
    sourceSha256: source.sourceSha256,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveWorkflowDraftByPublicId.mockResolvedValue(draft);
  mocks.getWorkflowIndexEntry.mockResolvedValue(validIndexEntry());
  mocks.compileWorkflowToTriggerTask.mockReturnValue({ success: true, sourceText: "task" });
});

describe("startWorkflowDraftSource", () => {
  it("opens only the exact catalog-bound source at the workflow draft base commit", async () => {
    const functionCatalog = {
      read: vi.fn().mockResolvedValue({
        success: true,
        value: {
          source: { commitSha: baseCommitSha },
          catalog: {
            functions: [
              {
                id: "qualify_lead",
                codeReference: {
                  path: "./src/functions/qualifyLead.ts",
                  exportName: "qualifyLead",
                },
              },
            ],
          },
        },
      }),
    };
    const sourcePatchStore = {
      read: vi.fn().mockResolvedValue({
        success: true,
        value: {
          path: "src/functions/qualifyLead.ts",
          sourceText,
          requestedRevision: baseCommitSha,
          commitSha: baseCommitSha,
          blobSha: sourceBlobSha,
        },
      }),
    };
    const created = { source: sourceRecord(), created: true };
    mocks.createWorkflowIndexGitHubGateway.mockResolvedValue({
      functionCatalog,
      sourcePatchStore,
    });
    mocks.createOrResumeWorkflowDraftSourceFile.mockResolvedValue(created);

    const result = await startWorkflowDraftSource({
      scope,
      draftPublicId: draft.publicId,
      nodeId: "qualify_lead",
      actorId: "actor-1",
      correlationId: "correlation-1",
    });

    expect(result).toBe(created);
    expect(functionCatalog.read).toHaveBeenCalledWith({ scope, revision: baseCommitSha });
    expect(sourcePatchStore.read).toHaveBeenCalledWith({
      scope,
      path: "src/functions/qualifyLead.ts",
      revision: baseCommitSha,
    });
    expect(mocks.createOrResumeWorkflowDraftSourceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        scope,
        draft,
        identity: {
          functionId: "qualify_lead",
          sourcePath: "src/functions/qualifyLead.ts",
          exportName: "qualifyLead",
          baseCommitSha,
          baseBlobSha: sourceBlobSha,
        },
        sourceText,
      })
    );
  });

  it("fails closed when the node path differs from the exact function catalog", async () => {
    const sourcePatchStore = { read: vi.fn() };
    mocks.createWorkflowIndexGitHubGateway.mockResolvedValue({
      functionCatalog: {
        read: vi.fn().mockResolvedValue({
          success: true,
          value: {
            source: { commitSha: baseCommitSha },
            catalog: {
              functions: [
                {
                  id: "qualify_lead",
                  codeReference: {
                    path: "src/functions/different.ts",
                    exportName: "qualifyLead",
                  },
                },
              ],
            },
          },
        }),
      },
      sourcePatchStore,
    });

    await expect(
      startWorkflowDraftSource({
        scope,
        draftPublicId: draft.publicId,
        nodeId: "qualify_lead",
        actorId: "actor-1",
      })
    ).rejects.toMatchObject({ code: "stale_source" });
    expect(sourcePatchStore.read).not.toHaveBeenCalled();
  });
});

describe("source-aware publication proof", () => {
  it("creates one deterministic patch identity from exact reviewed source versions", async () => {
    const second = sourceRecord(
      "src/functions/zeta.ts",
      "export const zeta = true;\n",
      "33333333-3333-4333-8333-333333333333"
    );
    const first = sourceRecord(
      "src/functions/alpha.ts",
      "export const alpha = true;\n",
      "44444444-4444-4444-8444-444444444444"
    );
    mocks.getChangedWorkflowDraftSourceFiles.mockResolvedValue([second, first]);

    const left = await getPublishableWorkflowDraftSourcePatches({
      scope,
      draftPublicId: draft.publicId,
      expectedSources: [expectedSource(second), expectedSource(first)],
    });
    mocks.getChangedWorkflowDraftSourceFiles.mockResolvedValue([first, second]);
    const right = await getPublishableWorkflowDraftSourcePatches({
      scope,
      draftPublicId: draft.publicId,
      expectedSources: [expectedSource(first), expectedSource(second)],
    });

    expect(left.digest).toBe(right.digest);
    expect(left.patches.map((patch) => patch.path)).toEqual([
      "src/functions/alpha.ts",
      "src/functions/zeta.ts",
    ]);
    expect(left.patches[0]?.expectedBlobSha).toBe(sourceBlobSha);
  });

  it("rejects an omitted, stale, or duplicate source review identity", async () => {
    const source = sourceRecord();
    mocks.getChangedWorkflowDraftSourceFiles.mockResolvedValue([source]);

    await expect(
      getPublishableWorkflowDraftSourcePatches({
        scope,
        draftPublicId: draft.publicId,
        expectedSources: [],
      })
    ).rejects.toMatchObject({ code: "draft_conflict" });
    await expect(
      getPublishableWorkflowDraftSourcePatches({
        scope,
        draftPublicId: draft.publicId,
        expectedSources: [{ ...expectedSource(source), version: 1n }],
      })
    ).rejects.toMatchObject({ code: "draft_conflict" });
    await expect(
      getPublishableWorkflowDraftSourcePatches({
        scope,
        draftPublicId: draft.publicId,
        expectedSources: [expectedSource(source), expectedSource(source)],
      })
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("requires the exact workflow version and deterministic compilation for source-only changes", async () => {
    const result = await getPublishableWorkflowDraftWithSourceChanges({
      scope,
      draftPublicId: draft.publicId,
      expectedVersion: 3n,
      sourcePatchCount: 1,
    });

    expect(result).toBe(draft);
    expect(mocks.compileWorkflowToTriggerTask).toHaveBeenCalledWith(workflow);

    mocks.compileWorkflowToTriggerTask.mockReturnValue({
      success: false,
      issues: [{ message: "Unsupported workflow" }],
    });
    await expect(
      getPublishableWorkflowDraftWithSourceChanges({
        scope,
        draftPublicId: draft.publicId,
        expectedVersion: 3n,
        sourcePatchCount: 1,
      })
    ).rejects.toMatchObject({ code: "compilation_failed" });
  });

  it("rejects a stale workflow version before publishing source changes", async () => {
    await expect(
      getPublishableWorkflowDraftWithSourceChanges({
        scope,
        draftPublicId: draft.publicId,
        expectedVersion: 2n,
        sourcePatchCount: 1,
      })
    ).rejects.toMatchObject({ code: "draft_conflict" });
    expect(mocks.compileWorkflowToTriggerTask).not.toHaveBeenCalled();
  });
});
