import type { GitHubRepositorySourcePatchStore } from "@flowcordia/github-workflows";
import { describe, expect, it, vi } from "vitest";

import { GitHubProposalSourcePatchService } from "../src/index.js";
import {
  BASE_BLOB_SHA,
  BASE_SHA,
  PROPOSAL_ID,
  createEnvironment,
  createPullRequest,
  createSnapshot,
  mutation,
} from "./fixtures.js";

const PATCH_HEAD_SHA = "f".repeat(40);
const PATCH_BLOB_SHA = "1".repeat(40);
const path = "src/functions/qualifyLead.ts";
const sourceText = "export function qualifyLead() { return { qualified: true }; }\n";

function createInput(environment: ReturnType<typeof createEnvironment>) {
  return {
    scope: environment.scope,
    proposalId: PROPOSAL_ID,
    creatorReviewerId: "300",
    workflow: environment.workflow,
    expectedBaseCommitSha: BASE_SHA,
    expectedBaseBlobSha: BASE_BLOB_SHA,
    mutation,
    sourcePatches: [{ path, sourceText, expectedBlobSha: null }],
  };
}

function notFound() {
  return {
    success: false as const,
    error: {
      code: "not_found" as const,
      operation: "read_source" as const,
      message: "not found",
      retryable: false,
    },
  };
}

function sourceFile(filePath = path, text = sourceText, blobSha = PATCH_BLOB_SHA) {
  return {
    success: true as const,
    value: {
      path: filePath,
      sourceText: text,
      requestedRevision: PATCH_HEAD_SHA,
      commitSha: PATCH_HEAD_SHA,
      blobSha,
    },
  };
}

function readySnapshot(environment: ReturnType<typeof createEnvironment>) {
  return createSnapshot({
    pullRequest: {
      ...createPullRequest({
        draft: true,
        headBranch: environment.proposalBranch,
        headSha: PATCH_HEAD_SHA,
      }),
    },
  });
}

describe("GitHubProposalSourcePatchService", () => {
  it("publishes source patches after the canonical workflow proposal and verifies the final head", async () => {
    const environment = createEnvironment();
    const read = vi.fn().mockResolvedValueOnce(notFound()).mockResolvedValueOnce(sourceFile());
    const sourcePatchStore = {
      read,
      save: vi.fn(async () => ({
        success: true as const,
        value: {
          path,
          sourceText,
          requestedRevision: environment.proposalBranch,
          commitSha: PATCH_HEAD_SHA,
          blobSha: PATCH_BLOB_SHA,
          previousBlobSha: null,
          noChange: false,
        },
      })),
    } as unknown as GitHubRepositorySourcePatchStore;
    environment.client.getProposalSnapshot.mockResolvedValue(readySnapshot(environment));
    const service = new GitHubProposalSourcePatchService({
      proposals: environment.service,
      clientResolver: environment.resolver,
      sourcePatchStore,
    });

    const result = await service.create(createInput(environment));

    expect(result).toMatchObject({
      success: true,
      value: {
        proposal: { headSha: PATCH_HEAD_SHA },
        audit: { headSha: PATCH_HEAD_SHA },
      },
    });
    expect(sourcePatchStore.save).toHaveBeenCalledWith({
      scope: {
        ...environment.scope,
        repository: { ...environment.scope.repository, branch: environment.proposalBranch },
      },
      patch: { path, sourceText, expectedBlobSha: null },
      mutation,
    });
    expect(read).toHaveBeenLastCalledWith({
      scope: {
        ...environment.scope,
        repository: { ...environment.scope.repository, branch: environment.proposalBranch },
      },
      path,
      revision: PATCH_HEAD_SHA,
    });
  });

  it("rejects invalid patches before creating a proposal", async () => {
    const environment = createEnvironment();
    const sourcePatchStore = {
      read: vi.fn(),
      save: vi.fn(),
    } as unknown as GitHubRepositorySourcePatchStore;
    const service = new GitHubProposalSourcePatchService({
      proposals: environment.service,
      clientResolver: environment.resolver,
      sourcePatchStore,
    });

    const result = await service.create({
      ...createInput(environment),
      sourcePatches: [{ path: "../escape.ts", sourceText, expectedBlobSha: null }],
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: "invalid_input", phase: "validation" },
    });
    expect(environment.client.createBranch).not.toHaveBeenCalled();
  });

  it("recovers an ambiguous source write only when exact content remains at the final head", async () => {
    const environment = createEnvironment();
    const read = vi
      .fn()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(sourceFile())
      .mockResolvedValueOnce(sourceFile());
    const sourcePatchStore = {
      read,
      save: vi.fn(async () => ({
        success: false as const,
        error: {
          code: "ambiguous_write" as const,
          operation: "save_source" as const,
          message: "ambiguous",
          retryable: true,
          path,
        },
      })),
    } as unknown as GitHubRepositorySourcePatchStore;
    environment.client.getProposalSnapshot.mockResolvedValue(readySnapshot(environment));
    const service = new GitHubProposalSourcePatchService({
      proposals: environment.service,
      clientResolver: environment.resolver,
      sourcePatchStore,
    });

    const result = await service.create(createInput(environment));

    expect(result).toMatchObject({ success: true, value: { proposal: { headSha: PATCH_HEAD_SHA } } });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("resumes a partial multi-file publication without rewriting an exact completed file", async () => {
    const environment = createEnvironment();
    const firstPath = "src/functions/a.ts";
    const secondPath = "src/functions/b.ts";
    const firstText = "export const a = true;\n";
    const secondText = "export const b = true;\n";
    const read = vi
      .fn()
      .mockResolvedValueOnce(sourceFile(firstPath, firstText, "2".repeat(40)))
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(sourceFile(firstPath, firstText, "2".repeat(40)))
      .mockResolvedValueOnce(sourceFile(secondPath, secondText, "3".repeat(40)));
    const save = vi.fn(async () => ({
      success: true as const,
      value: {
        path: secondPath,
        sourceText: secondText,
        requestedRevision: environment.proposalBranch,
        commitSha: PATCH_HEAD_SHA,
        blobSha: "3".repeat(40),
        previousBlobSha: null,
        noChange: false,
      },
    }));
    const sourcePatchStore = { read, save } as unknown as GitHubRepositorySourcePatchStore;
    environment.client.getProposalSnapshot.mockResolvedValue(readySnapshot(environment));
    const service = new GitHubProposalSourcePatchService({
      proposals: environment.service,
      clientResolver: environment.resolver,
      sourcePatchStore,
    });

    const result = await service.create({
      ...createInput(environment),
      sourcePatches: [
        { path: secondPath, sourceText: secondText, expectedBlobSha: null },
        { path: firstPath, sourceText: firstText, expectedBlobSha: null },
      ],
    });

    expect(result).toMatchObject({ success: true, value: { proposal: { headSha: PATCH_HEAD_SHA } } });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: { path: secondPath, sourceText: secondText, expectedBlobSha: null },
      })
    );
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("fails closed when a source file changes before final-head verification", async () => {
    const environment = createEnvironment();
    const read = vi
      .fn()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(sourceFile(path, "export const tampered = true;\n"));
    const sourcePatchStore = {
      read,
      save: vi.fn(async () => ({
        success: true as const,
        value: {
          path,
          sourceText,
          requestedRevision: environment.proposalBranch,
          commitSha: PATCH_HEAD_SHA,
          blobSha: PATCH_BLOB_SHA,
          previousBlobSha: null,
          noChange: false,
        },
      })),
    } as unknown as GitHubRepositorySourcePatchStore;
    environment.client.getProposalSnapshot.mockResolvedValue(readySnapshot(environment));
    const service = new GitHubProposalSourcePatchService({
      proposals: environment.service,
      clientResolver: environment.resolver,
      sourcePatchStore,
    });

    const result = await service.create(createInput(environment));

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "conflict",
        phase: "workflow",
        proposalBranch: environment.proposalBranch,
      },
    });
  });
});
