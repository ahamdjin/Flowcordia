import type { WorkflowDefinition } from "@flowcordia/workflow";
import type {
  GitHubRepositoryTarget,
  GitHubWorkflowAccessScope,
  GitHubWorkflowStore,
} from "@flowcordia/github-workflows";
import { vi, type Mocked } from "vitest";

import {
  GitHubProposalService,
  buildProposalBody,
  buildProposalBranch,
  type GitHubCheck,
  type GitHubProposalClient,
  type GitHubProposalIdentity,
  type GitHubProposalSnapshot,
  type GitHubPullRequest,
  type GitHubReview,
} from "../src/index.js";

export const BASE_SHA = "a".repeat(40);
export const HEAD_SHA = "b".repeat(40);
export const MERGE_SHA = "c".repeat(40);
export const BASE_BLOB_SHA = "d".repeat(40);
export const HEAD_BLOB_SHA = "e".repeat(40);
export const PROPOSAL_ID = "proposal_0001";

export function createScope(): GitHubWorkflowAccessScope {
  return {
    tenantId: "tenant_1",
    projectId: "project_1",
    installationId: 42,
    repository: { owner: "acme", name: "automations", branch: "main" },
  };
}

export function createWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "order_intake",
    name: "Order intake",
    description: "Validate and route a new order.",
    nodes: [
      {
        id: "order_created",
        name: "Order created",
        kind: "trigger",
        operation: "webhook.receive",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "route_order",
        name: "Route order",
        kind: "action",
        operation: "http.request",
        position: { x: 300, y: 0 },
        configuration: { url: "https://example.test/orders" },
      },
    ],
    edges: [{ id: "created_to_route", source: "order_created", target: "route_order" }],
  };
}

export function createIdentity(): GitHubProposalIdentity {
  return {
    proposalId: PROPOSAL_ID,
    workflowId: "order_intake",
    baseCommitSha: BASE_SHA,
    creatorReviewerId: "300",
  };
}

export function createPullRequest(
  overrides: Partial<GitHubPullRequest> = {},
  workflow = createWorkflow()
): GitHubPullRequest {
  const scope = createScope();
  const identity = createIdentity();
  return {
    number: 17,
    nodeId: "PR_node_17",
    url: "https://github.com/acme/automations/pull/17",
    state: "open",
    draft: false,
    merged: false,
    mergeCommitSha: null,
    baseBranch: scope.repository.branch,
    headBranch: buildProposalBranch(workflow.id, identity.proposalId),
    headSha: HEAD_SHA,
    authorId: "100",
    body: buildProposalBody(identity, workflow),
    mergeable: true,
    mergeableState: "clean",
    ...overrides,
  };
}

export function createReview(overrides: Partial<GitHubReview> = {}): GitHubReview {
  return {
    id: 1,
    reviewerId: "200",
    state: "approved",
    commitSha: HEAD_SHA,
    submittedAt: "2026-07-15T10:00:00.000Z",
    ...overrides,
  };
}

export function createCheck(overrides: Partial<GitHubCheck> = {}): GitHubCheck {
  return {
    id: 1,
    name: "PR Checks",
    commitSha: HEAD_SHA,
    status: "completed",
    conclusion: "success",
    startedAt: "2026-07-15T10:00:00.000Z",
    completedAt: "2026-07-15T10:01:00.000Z",
    ...overrides,
  };
}

export function createSnapshot(
  overrides: {
    pullRequest?: Partial<GitHubPullRequest>;
    checks?: GitHubCheck[];
    reviews?: GitHubReview[];
  } = {}
): GitHubProposalSnapshot {
  return {
    pullRequest: createPullRequest(overrides.pullRequest),
    checks: overrides.checks ?? [createCheck()],
    reviews: overrides.reviews ?? [createReview()],
  };
}

interface EnvironmentState {
  branchExists: boolean;
  branchSha: string;
  pullRequests: GitHubPullRequest[];
}

export function createEnvironment(
  options: {
    branchExists?: boolean;
    branchSha?: string;
    pullRequests?: GitHubPullRequest[];
    snapshot?: GitHubProposalSnapshot;
  } = {}
) {
  const scope = createScope();
  const workflow = createWorkflow();
  const identity = createIdentity();
  const proposalBranch = buildProposalBranch(workflow.id, identity.proposalId);
  const state: EnvironmentState = {
    branchExists: options.branchExists ?? false,
    branchSha: options.branchSha ?? BASE_SHA,
    pullRequests: options.pullRequests ?? [],
  };

  const client = {
    getBranch: vi.fn(async ({ branch }: { repository: GitHubRepositoryTarget; branch: string }) => {
      if (branch === scope.repository.branch) return { exists: true as const, sha: BASE_SHA };
      return state.branchExists
        ? { exists: true as const, sha: state.branchSha }
        : { exists: false as const };
    }),
    createBranch: vi.fn(
      async ({
        fromCommitSha,
      }: {
        repository: GitHubRepositoryTarget;
        branch: string;
        fromCommitSha: string;
      }) => {
        state.branchExists = true;
        state.branchSha = fromCommitSha;
        return { sha: fromCommitSha };
      }
    ),
    findPullRequests: vi.fn(async () => state.pullRequests),
    createPullRequest: vi.fn(async () => {
      const pullRequest = createPullRequest({ draft: true, headSha: state.branchSha });
      state.pullRequests = [pullRequest];
      return pullRequest;
    }),
    getProposalSnapshot: vi.fn(async () => options.snapshot ?? createSnapshot()),
    markReadyForReview: vi.fn(async () => createPullRequest({ draft: false })),
    mergePullRequest: vi.fn(async () => ({ merged: true, mergeCommitSha: MERGE_SHA })),
  } as unknown as Mocked<GitHubProposalClient>;

  const workflowStore = {
    read: vi.fn(async () => ({
      success: true as const,
      value: {
        workflow,
        source: {
          repository: { ...scope.repository, branch: proposalBranch },
          path: ".flowcordia/workflows/order_intake.json",
          requestedRevision: proposalBranch,
          commitSha: state.branchSha,
          blobSha: HEAD_BLOB_SHA,
          sourceSchemaVersion: "0.1",
        },
        appliedMigrations: [],
      },
    })),
    save: vi.fn(async () => {
      state.branchSha = HEAD_SHA;
      return {
        success: true as const,
        value: {
          workflow,
          source: {
            repository: { ...scope.repository, branch: proposalBranch },
            path: ".flowcordia/workflows/order_intake.json",
            requestedRevision: proposalBranch,
            commitSha: HEAD_SHA,
            blobSha: HEAD_BLOB_SHA,
            sourceSchemaVersion: "0.1",
          },
          previousBlobSha: BASE_BLOB_SHA,
          noChange: false,
          audit: null,
        },
      };
    }),
  } as unknown as Mocked<GitHubWorkflowStore>;
  const resolver = { resolve: vi.fn(async () => client) };
  const service = new GitHubProposalService({ clientResolver: resolver, workflowStore });

  return {
    scope,
    workflow,
    identity,
    proposalBranch,
    state,
    client,
    workflowStore,
    resolver,
    service,
  };
}

export const mutation = {
  actorId: "user_42",
  correlationId: "request_42",
  reason: "Requested from Studio",
};
