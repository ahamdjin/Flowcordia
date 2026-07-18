import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gateway: {
    create: vi.fn(),
    submit: vi.fn(),
    promote: vi.fn(),
  },
  canonicalCreate: vi.fn(),
  constructed: vi.fn(),
  createGitHubProposalGateway: vi.fn(),
}));

vi.mock("@flowcordia/control-plane", async () => {
  const actual = await vi.importActual<typeof import("@flowcordia/control-plane")>(
    "@flowcordia/control-plane"
  );
  return {
    ...actual,
    ProposalCommandService: class {
      constructor(input: unknown) {
        mocks.constructed(input);
      }

      create(command: unknown) {
        return mocks.canonicalCreate(command);
      }
    },
  };
});
vi.mock("./github.server", () => ({
  createGitHubProposalGateway: mocks.createGitHubProposalGateway,
}));
vi.mock("./prisma.server", () => ({
  flowcordiaProposalStore: { kind: "test-proposal-store" },
}));

import { createSourceAwareProposalCommandService } from "./source-command.server";
import { canonicalSourcePatchIdentity } from "./source-patch-identity";

const scope = {
  tenantId: "org-1",
  projectId: "project-1",
  githubAppInstallationId: "github-installation-1",
  installationId: "100",
  repositoryId: "repository-1",
  repositoryGithubId: "200",
  repository: { owner: "acme", name: "workflow-repo", branch: "main" },
};
const sourcePatches = [
  {
    path: "src/functions/qualifyLead.ts",
    sourceText: "export async function qualifyLead() { return { qualified: true }; }\n",
    expectedBlobSha: "a".repeat(40),
  },
];
const command = {
  scope,
  proposalId: "studio-s-123",
  creatorReviewerId: null,
  workflow: {
    schemaVersion: 0,
    id: "lead_intake",
    name: "Lead intake",
    description: null,
    labels: [],
    nodes: [],
    edges: [],
  },
  expectedBaseCommitSha: "b".repeat(40),
  expectedBaseBlobSha: "c".repeat(40),
  actorId: "actor-1",
  correlationId: "correlation-1",
  sourcePatches,
  sourceDigest: canonicalSourcePatchIdentity(sourcePatches).digest,
};
const canonicalResult = {
  success: true,
  value: {
    proposal: { proposalId: command.proposalId },
    github: null,
    resumed: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createGitHubProposalGateway.mockResolvedValue(mocks.gateway);
  mocks.canonicalCreate.mockResolvedValue(canonicalResult);
  mocks.gateway.create.mockResolvedValue({ success: true, value: { pullRequestNumber: 20 } });
});

describe("createSourceAwareProposalCommandService", () => {
  it("rejects a mismatched digest before constructing durable proposal intent", async () => {
    const service = await createSourceAwareProposalCommandService(scope);
    const result = await service.create({ ...command, sourceDigest: "0".repeat(64) });

    expect(result).toMatchObject({
      success: false,
      error: { code: "invalid_input", operation: "create", retryable: false },
    });
    expect(mocks.constructed).not.toHaveBeenCalled();
    expect(mocks.canonicalCreate).not.toHaveBeenCalled();
  });

  it("uses one canonical proposal service and injects only canonical source patches", async () => {
    const service = await createSourceAwareProposalCommandService(scope);
    const result = await service.create(command);

    expect(result).toBe(canonicalResult);
    expect(mocks.constructed).toHaveBeenCalledTimes(1);
    expect(mocks.canonicalCreate).toHaveBeenCalledTimes(1);
    expect(mocks.canonicalCreate).toHaveBeenCalledWith(command);

    const construction = mocks.constructed.mock.calls[0]?.[0] as {
      github: { create: (input: Record<string, unknown>) => Promise<unknown> };
    };
    const baseInput = {
      scope,
      proposalId: command.proposalId,
      creatorReviewerId: null,
      workflow: command.workflow,
      expectedBaseCommitSha: command.expectedBaseCommitSha,
      expectedBaseBlobSha: command.expectedBaseBlobSha,
      mutation: { actorId: command.actorId, correlationId: command.correlationId },
    };
    await construction.github.create(baseInput);

    expect(mocks.gateway.create).toHaveBeenCalledTimes(1);
    expect(mocks.gateway.create).toHaveBeenCalledWith({
      ...baseInput,
      sourcePatches: canonicalSourcePatchIdentity(sourcePatches).patches,
    });
  });
});
