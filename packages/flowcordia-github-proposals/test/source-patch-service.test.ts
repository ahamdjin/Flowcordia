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

describe("GitHubProposalSourcePatchService", () => {
  it("publishes source patches after the canonical workflow proposal and returns the final head", async () => {
    const environment = createEnvironment();
    const sourcePatchStore = {
      read: vi.fn(async () => ({
        success: false as const,
        error: {
          code: "not_found" as const,
          operation: "read_source" as const,
          message: "not found",
          retryable: false,
        },
      })),
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
    environment.client.getProposalSnapshot.mockResolvedValue(
      createSnapshot({
        pullRequest: {
          ...createPullRequest({
            draft: true,
            headBranch: environment.proposalBranch,
            headSha: PATCH_HEAD_SHA,
          }),
        },
      })
    );
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

  it("recovers an ambiguous source write only when exact content is visible", async () => {
    const environment = createEnvironment();
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: {
          code: "not_found",
          operation: "read_source",
          message: "not found",
          retryable: false,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        value: {
          path,
          sourceText,
          requestedRevision: environment.proposalBranch,
          commitSha: PATCH_HEAD_SHA,
          blobSha: PATCH_BLOB_SHA,
        },
      });
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
    environment.client.getProposalSnapshot.mockResolvedValue(
      createSnapshot({
        pullRequest: {
          ...createPullRequest({
            draft: true,
            headBranch: environment.proposalBranch,
            headSha: PATCH_HEAD_SHA,
          }),
        },
      })
    );
    const service = new GitHubProposalSourcePatchService({
      proposals: environment.service,
      clientResolver: environment.resolver,
      sourcePatchStore,
    });

    const result = await service.create(createInput(environment));

    expect(result).toMatchObject({ success: true, value: { proposal: { headSha: PATCH_HEAD_SHA } } });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
