import type { ControlPlaneScope, GitHubProposalGateway } from "@flowcordia/control-plane";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSourceAwareProposalCommandService,
  type CreateSourceProposalCommand,
} from "./source-command.server";
import { canonicalSourcePatchIdentity } from "./source-patch-identity";

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

const scope = {
  tenantId: "org-1",
  projectId: "project-1",
  installationId: 100,
  repositoryId: "repository-1",
  repositoryGithubId: "200",
  repository: { owner: "acme", name: "workflow-repo", branch: "main" },
} satisfies ControlPlaneScope;
const workflow = {
  schemaVersion: "0.1",
  id: "lead_intake",
  name: "Lead intake",
  labels: [],
  nodes: [],
  edges: [],
} satisfies WorkflowDefinition;
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
  workflow,
  expectedBaseCommitSha: "b".repeat(40),
  expectedBaseBlobSha: "c".repeat(40),
  actorId: "actor-1",
  correlationId: "correlation-1",
  sourcePatches,
  sourceDigest: canonicalSourcePatchIdentity(sourcePatches).digest,
} satisfies CreateSourceProposalCommand;
const canonicalResult = {
  success: true as const,
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
      github: GitHubProposalGateway;
    };
    const baseInput = {
      scope,
      proposalId: command.proposalId,
      creatorReviewerId: null,
      workflow,
      expectedBaseCommitSha: command.expectedBaseCommitSha,
      expectedBaseBlobSha: command.expectedBaseBlobSha,
      mutation: { actorId: command.actorId, correlationId: command.correlationId },
    } satisfies Parameters<GitHubProposalGateway["create"]>[0];
    await construction.github.create(baseInput);

    expect(mocks.gateway.create).toHaveBeenCalledTimes(1);
    expect(mocks.gateway.create).toHaveBeenCalledWith({
      ...baseInput,
      sourcePatches: canonicalSourcePatchIdentity(sourcePatches).patches,
    });
  });
});
