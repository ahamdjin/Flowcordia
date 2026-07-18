import {
  ProposalCommandService,
  type ControlPlaneScope,
  type GitHubProposalGateway,
} from "@flowcordia/control-plane";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindCanonicalSourcePatches,
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
  proposalStore: {
    transaction: vi.fn(),
  },
  createGitHubProposalGateway: vi.fn(),
}));

vi.mock("./github.server", () => ({
  createGitHubProposalGateway: mocks.createGitHubProposalGateway,
}));
vi.mock("./prisma.server", () => ({
  flowcordiaProposalStore: mocks.proposalStore,
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
  success: false as const,
  error: {
    code: "conflict" as const,
    operation: "create" as const,
    proposalId: command.proposalId,
    message: "Test canonical result.",
    retryable: false,
  },
} satisfies Awaited<ReturnType<ProposalCommandService["create"]>>;
const canonicalCreate = vi.spyOn(ProposalCommandService.prototype, "create");

beforeEach(() => {
  vi.clearAllMocks();
  canonicalCreate.mockResolvedValue(canonicalResult);
  mocks.createGitHubProposalGateway.mockResolvedValue(mocks.gateway);
  mocks.gateway.create.mockResolvedValue({ success: true, value: { pullRequestNumber: 20 } });
});

describe("bindCanonicalSourcePatches", () => {
  it("injects only the validated canonical patches into the create operation", async () => {
    const gateway = bindCanonicalSourcePatches(
      mocks.gateway as unknown as Parameters<typeof bindCanonicalSourcePatches>[0],
      canonicalSourcePatchIdentity(sourcePatches).patches
    );
    const baseInput = {
      scope,
      proposalId: command.proposalId,
      creatorReviewerId: null,
      workflow,
      expectedBaseCommitSha: command.expectedBaseCommitSha,
      expectedBaseBlobSha: command.expectedBaseBlobSha,
      mutation: { actorId: command.actorId, correlationId: command.correlationId },
    } satisfies Parameters<GitHubProposalGateway["create"]>[0];

    await gateway.create(baseInput);

    expect(mocks.gateway.create).toHaveBeenCalledWith({
      ...baseInput,
      sourcePatches: canonicalSourcePatchIdentity(sourcePatches).patches,
    });
  });
});

describe("createSourceAwareProposalCommandService", () => {
  it("rejects a mismatched digest before durable proposal intent", async () => {
    const service = await createSourceAwareProposalCommandService(scope);
    const result = await service.create({ ...command, sourceDigest: "0".repeat(64) });

    expect(result).toMatchObject({
      success: false,
      error: { code: "invalid_input", operation: "create", retryable: false },
    });
    expect(canonicalCreate).not.toHaveBeenCalled();
    expect(mocks.proposalStore.transaction).not.toHaveBeenCalled();
  });

  it("delegates valid source publication to the canonical state machine exactly once", async () => {
    const service = await createSourceAwareProposalCommandService(scope);
    const result = await service.create(command);

    expect(result).toBe(canonicalResult);
    expect(canonicalCreate).toHaveBeenCalledTimes(1);
    expect(canonicalCreate).toHaveBeenCalledWith(command);
  });
});
